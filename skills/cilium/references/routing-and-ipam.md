# Cilium Routing, IPAM, Masquerading, Encryption & L2/VTEP (v1.20)

## Routing Modes

### 1. Encapsulation / Tunnel Mode (Default)

Nodes form a UDP tunnel mesh using **VXLAN** (`8472/udp`, default) or **Geneve** (`6081/udp`):
- **Pros**: Minimal underlying network requirements (only node IP reachability needed); spans L2/L3 boundaries; carries source security identity in tunnel headers.
- **Cons**: ~50 bytes MTU overhead per packet (mitigated by jumbo frames).
- **Config**: `routingMode: tunnel`, `tunnelProtocol: vxlan` (or `geneve`), `tunnelPort: 8472`, `underlayProtocol: auto`.

### 2. Native-Routing Mode

Enabled via `routingMode: native` + `ipv4NativeRoutingCIDR: "10.244.0.0/16"`. Non-local packets are handed directly to the Linux kernel routing table:
- **Requirements**: Either the underlying router/cloud VPC routes PodCIDRs (GCP Alias IPs, AWS ENI, Azure IPAM), OR nodes share routes via `autoDirectNodeRoutes: true` (same L2 domain) or **BGP Control Plane**.
- **Multi-zone Optimization**: `directRoutingSkipUnreachable: true` alongside `autoDirectNodeRoutes: true` uses direct L2 within each subnet and BGP across L3 boundaries.

---

## IP Address Management (IPAM)

| Mode | Tunnel | Direct | CIDR Config | Multi-CIDR/Cluster | Multi-CIDR/Node | Dynamic Alloc |
|------|--------|--------|-------------|--------------------|-----------------|---------------|
| `cluster-pool` (default) | ✅ | ✅ | Cilium | ✅ | ❌ | ❌ |
| `kubernetes` (host-scope) | ✅ | ✅ | K8s Node `.podCIDR` | ❌ | ❌ | ❌ |
| `multi-pool` | ✅ | ✅ | Cilium (`CiliumPodIPPool`) | ✅ | ✅ | ✅ |
| `crd` | ❌ | ✅ | External | N/A | N/A | ✅ |
| `eni` (AWS) | ❌ | ✅ | AWS VPC/ENI | N/A | N/A | ✅ |
| `azure` | ❌ | ✅ | Azure VNet | N/A | N/A | ✅ |
| GKE (`gke.enabled=true`) | ❌ | ✅ | GCP Alias IPs | N/A | N/A | ❌ |

> **Warning**: Never change IPAM mode in-place on a running cluster—the **only** supported online migration is `cluster-pool` -> `multi-pool`.

---

## Masquerading (SNAT) & `ip-masq-agent`

Pods leaving the cluster are SNATed to the node's routable IP unless the destination falls inside `ipv4NativeRoutingCIDR` / `ipv6NativeRoutingCIDR` (or cloud VPC CIDR auto-detected):
- **Disable**: `enableIPv4Masquerade: false` / `enableIPv6Masquerade: false`.
- **eBPF Masquerading (`bpf.masquerade=true`)**:
  - Production-ready for IPv4 (Beta for IPv6); enables BPF Host-Routing; depends on BPF NodePort.
  - Supports **TCP**, **UDP**, and **ICMP** (Echo Request/Reply and Frag Needed).
  - *Caveat*: Traffic from pods to a node's **ExternalIP** is NOT masqueraded in eBPF mode.
  - `enableRemoteNodeMasquerade: true`: Masquerades pod-to-remote-node `InternalIP` traffic (not pod-to-pod).
- **eBPF `ip-masq-agent` (`ipMasqAgent.enabled=true`)**:
  - Reads `nonMasqueradeCIDRs`, `masqLinkLocal`, `masqLinkLocalIPv6` from ConfigMap `ip-masq-agent` (uses `fsnotify`, no resync delay).
  - Inspect via `cilium-dbg bpf ipmasq list`.
- **Legacy `iptables` Masquerading**: Works on older kernels; restrict interfaces via `egressMasqueradeInterfaces: "eth+"`; `enableMasqueradeToRouteSource: true` SNATs to longest-prefix route source IP.

---

## IP Fragmentation Handling (Beta)

Enabled by default (`--enable-ipv4-fragment-tracking`, `--enable-ipv6-fragment-tracking`, map limit `--bpf-fragments-map-max=8192`). Monitor pressure via `cilium_bpf_map_pressure{map_name="cilium_ipv4_frag_datagrams"}` and PMTUD via `mtu_error_message_total`.

---

## Bandwidth Manager & BBR Congestion Control

Uses **EDT (Earliest Departure Time) + eBPF** for egress and eBPF token-bucket for ingress (replaces `bandwidth` CNI plugin):
- **Enable**: `--set bandwidthManager.enabled=true` (recommended with eBPF Host-Routing; requires `CONFIG_NET_SCH_FQ=m`).
- **Per-Pod Annotations**:
  - `kubernetes.io/egress-bandwidth: "10M"`
  - `kubernetes.io/ingress-bandwidth: "20M"`
- **BBR Congestion Control**: `--set bandwidthManager.bbr=true` (requires **Linux kernel `>= 5.18`** + eBPF Host-Routing; or `bbrHostNamespaceOnly=true` for hostns only).
- **Verify**: `cilium-dbg status | grep BandwidthManager` and `cilium-dbg bpf bandwidth list`.
- **Limitations**: Egress bandwidth enforcement is disabled for pods selected by an **L7 egress `CiliumNetworkPolicy`**; unsupported in nested netns (e.g., Kind).

---

## Transparent Encryption (WireGuard, IPsec & Ztunnel)

Cilium transparently encrypts pod-to-pod and host-to-host traffic using:
- **WireGuard (`encryption.enabled=true`, `encryption.type=wireguard`)**: Uses UDP `51871` (`kernel >= 5.10`). Set `encryption.nodeEncryption=true` to also encrypt node-to-node host traffic.
- **IPsec (`encryption.type=ipsec`)**: Uses Linux XFRM (`ESP` protocol, routing table `200`). Requires XFRM/GCM kernel modules and key rotation Secret.
- **Ztunnel (Beta)**: Recommended replacement for deprecated Mutual Authentication (Beta).

### Strict Mode Caveats & Protection
- **Unencrypted leak on new endpoints**: Before remote identity propagates, initial packets to new pods when `world` egress is allowed may leave unencrypted.
- **Strict Mode Egress**: `encryption.strictMode.egress.enabled=true` + `encryption.strictMode.egress.cidr=<ipv4PodCIDR>` (IPv4-only; set `allowRemoteNodeIdentities=true` if node & pod CIDRs overlap or tunneling is used).
- **Strict Mode Ingress (WireGuard only)**: `encryption.strictMode.ingress.enabled=true` drops cluster-internal pod ingress not arriving via WireGuard. **Unsupported with CNI chaining** and does not cover node-to-node traffic.

---

## L2 Announcements / L2 Aware LB (Beta)

Allows a leader node to answer ARP/NDP queries for `LoadBalancer` IPs and `ExternalIPs` on on-prem L2 networks without BGP:
- **Prerequisites**: `kubeProxyReplacement=true`, `l2announcements.enabled=true`, and elevated `k8sClientRateLimit.qps` / `burst` (`QPS >= #services * (1 / leaseRenewDeadline)` because Lease renewals hit the API server).
- **CRD (`CiliumL2AnnouncementPolicy`, `cilium.io/v2alpha1`)**: Matches `serviceSelector`, `nodeSelector`, `interfaces` (Go regex), `externalIPs: true`, `loadBalancerIPs: true`.
- **Lease Tuning**: `l2announcements.leaseDuration` (`15s`), `leaseRenewDeadline` (`5s`), `leaseRetryPeriod` (`2s`).
- **Limitations**: Single leader handles all traffic per VIP; **incompatible with `externalTrafficPolicy: Local`** (use `Cluster`).
- **L2 Pod Announcements**: `l2podAnnouncements.enabled=true` + `interfacePattern='^eth0$'` sends Gratuitous ARP for new local pods (IPv4 only).

---

## VXLAN Tunnel Endpoint (VTEP) & Node IPAM LB

- **VTEP Integration (Beta)**: Integrates 3rd-party VTEPs (e.g., BIG-IP) on **VNI 2** (`8472/udp`) via `vtep.enabled=true`, `vtep.endpoint`, `vtep.cidr`, `vtep.mask`, `vtep.mac`. **Incompatible with IPsec**.
- **Node IPAM LB (`nodeIPAM.enabled=true`)**: Advertises node `ExternalIP`/`InternalIP` directly on `Service` (`loadBalancerClass: io.cilium/node` or `defaultLBServiceIPAM=nodeipam`). Filter nodes with `io.cilium.nodeipam/match-node-labels`. **Incompatible with Cilium Gateway API / Ingress when `externalTrafficPolicy: Local` is set**.

---

## Pod Annotations (Networking)

- `cilium.io/mac-address`: Assign a specific MAC address to a pod.
- `cilium.io/disable-source-ip-verification`: Disable anti-spoofing source IP check for a pod.
- `network.cilium.io/no-track-host-ports`: Bypass iptables conntrack on specific `hostNetwork` pod ports (e.g., `"999/tcp,8123/tcp"`).
