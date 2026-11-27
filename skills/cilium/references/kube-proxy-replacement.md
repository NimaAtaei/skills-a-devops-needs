# Cilium Kube-Proxy Replacement & Load Balancing (v1.20)

## Overview & Setup

Cilium replaces `kube-proxy` completely using eBPF:
- **East-West**: **Socket-LB** (`cgroup v2` `connect4/6`, `sendmsg`, `recvmsg`) translates Service VIPs directly to backend pod IPs at socket creation, eliminating per-packet NAT overhead.
- **North-South**: `tc` / `XDP` eBPF load balancing handles `NodePort`, `LoadBalancer`, and `ExternalIPs`.

### Removing `kube-proxy` & Installing Cilium

```bash
# Fresh cluster:
kubeadm init --skip-phases=addon/kube-proxy

# Existing cluster (causes brief service disruption until Cilium is up):
kubectl -n kube-system delete ds kube-proxy
kubectl -n kube-system delete cm kube-proxy
# On each node as root:
iptables-save | grep -v KUBE | iptables-restore

# Install Cilium with full KPR:
helm install cilium oci://quay.io/cilium/charts/cilium --version 1.20.5 \
  --namespace kube-system \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=${API_SERVER_IP} \
  --set k8sServicePort=${API_SERVER_PORT}
```

> **Note**: `kubeProxyReplacement=true` fails fast if required kernel features are missing. Disable cgroup auto-mount if pre-mounted via `--set cgroup.autoMount.enabled=false --set cgroup.hostRoot=/sys/fs/cgroup`.

### Verification

```bash
kubectl -n kube-system exec ds/cilium -- cilium-dbg status --verbose | grep -A5 KubeProxyReplacement
kubectl -n kube-system exec ds/cilium -- cilium-dbg service list
iptables-save | grep KUBE-SVC   # Should return empty
```

---

## Traffic Policies & Exposure Controls

### `externalTrafficPolicy` & `internalTrafficPolicy`

| `internalTrafficPolicy` | `externalTrafficPolicy` | North-South Backends | East-West Backends |
|-------------------------|-------------------------|----------------------|--------------------|
| `Cluster` | `Cluster` | All (default) | All (default) |
| `Cluster` | `Local` | Node-local only (preserves client IP) | All (default) |
| `Local` | `Cluster` | All (default) | Node-local only |
| `Local` | `Local` | Node-local only | Node-local only |

- **External Access to ClusterIP**: Disabled by default; enable via `bpf.lbExternalClusterIP=true`.
- **LoadBalancer Source Ranges**: Enforced for external traffic; propagate to NodePort/External ClusterIP via `bpf.lbSourceRangeAllTypes=true`. Flip allow-list to deny-list with annotation `service.cilium.io/src-ranges-policy: deny`.
- **Selective Service Type Exposure**: Annotate Service with `service.cilium.io/type: LoadBalancer` (with `allocateLoadBalancerNodePorts: false`) or `NodePort` to avoid creating unused VIPs.
- **Selective Node Exposure**: Label nodes (`service.cilium.io/node=beefy`) and annotate Service with `service.cilium.io/node: beefy` or `service.cilium.io/node-selector: "service.cilium.io/node in (beefy)"` (restarting `cilium-agent` is required if node labels change later).
- **Host Proxy Delegation**: `service.cilium.io/proxy-delegation: delegate-if-local` passes N-S packets unmodified to hostns Envoy when the selected backend is the local node IP.
- **Topology Aware Hints / Traffic Distribution**: `loadBalancer.serviceTopology=true`.

---

## Load Balancing Modes: SNAT, DSR & Hybrid

Configured via `loadBalancer.mode`: `snat` (default), `dsr` (Direct Server Return—preserves client source IP without extra hop on return), `hybrid` (DSR for TCP, SNAT for UDP), or `annotation`.

| `loadBalancer.dsrDispatch` | Native Routing | Tunnel (Geneve) | Tunnel (VXLAN) | Notes |
|----------------------------|----------------|-----------------|----------------|-------|
| `opt` (IPv4/IPv6 options) | ✅ | ❌ | ❌ | Default for DSR; some cloud routers drop IP options |
| `geneve` | ✅ | ✅ | ❌ | Requires `tunnelProtocol=geneve` |
| `ipip` | ✅ | ❌ | ❌ | **Requires Service `port == targetPort`** |

- **Per-Service Annotation**: Enable `bpf.lbModeAnnotation=true` + explicit `loadBalancer.dsrDispatch`, then set `service.cilium.io/forwarding-mode: dsr | snat` at Service creation.
- **Caveats**: Disable cloud provider src/dst IP checks (e.g., AWS) for DSR; DSR is incompatible with TCP Fast Open (use `snat`).

---

## Maglev Consistent Hashing & Backend Weights

Enable globally via `loadBalancer.algorithm=maglev` (applies to N-S & XDP; E-W socket-LB connects directly):
- `maglev.tableSize`: Prime number (`251`, `509`, `1021`, `2039`, `4093`, `8191`, `16381` default, `32749`, `65521`, `131071`). Choose `M > 100 * max_backends` for `<= 1%` disruption.
- `maglev.hashSeed`: Base64-encoded 12-byte seed (`head -c12 /dev/urandom | base64 -w0`), identical across all nodes.
- **Per-Service Algorithm**: Enable `bpf.lbAlgorithmAnnotation=true` and set `service.cilium.io/lb-algorithm: maglev | random` at Service creation.
- **Weighted Backends**: Set `service.cilium.io/weight: "70"` (`0`–`65535`; `0` drains connections) on `EndpointSlice` (honored only with `maglev`).

---

## Socket-LB Bypass & XDP Acceleration

- **Socket-LB Bypass (`socketLB.hostNamespaceOnly=true`)**: Disables socket-LB inside pod network namespaces (falls back to `tc` LB at veth). Required for **Istio sidecars**, **KubeVirt**, **Kata Containers**, **gVisor**, or workloads using unconnected UDP (`sendto` without `connect`) that can leak `cilium_lb{4,6}_reverse_sk` entries.
- **XDP Acceleration (`loadBalancer.acceleration=native | best-effort`)**: Runs N-S LB (SNAT/DSR/hybrid) in XDP driver hook before `sk_buff` allocation. Packets redirected at XDP are invisible to `tcpdump` (use `cilium-dbg monitor` or metrics).
  - **AWS ENA**: `ena >= 2.2.8`, max MTU `3498`, combined channels `<= 1/2` max.
  - **Azure**: Accelerated Networking (`hv_netvsc`), disable LRO (`ethtool -K eth0 lro off`).
  - **GCP**: Not supported (`virtIO`/`gVNIC` lack native XDP).

---

## Ports, HostPort, Session Affinity & Graceful Termination

- **NodePort Range**: `nodePort.range="10000,32767"` (default `30000-32767`); auto-protected in `net.ipv4.ip_local_reserved_ports` unless `nodePort.autoProtectPortRanges=false`.
- **HostPort**: Automatically handled by Cilium when `kubeProxyReplacement=true` (must not overlap `nodePort.range`; explicit `127.0.0.1` `hostIP` binding in hostns is unsupported).
- **Graceful Termination**: Keeps active connections; falls back to `Terminating`+`Serving` endpoints only when no ready endpoints remain. Add `preStop` sleep `< terminationGracePeriodSeconds` to avoid Kubelet SIGTERM vs EndpointSlice race.
- **Session Affinity**: `sessionAffinity: ClientIP` (default 3h). Note: with Maglev, source port is excluded from the hash.
- **Health Check Server**: `kubeProxyReplacementHealthzBindAddr="0.0.0.0:10256"` exposes `/healthz` (disabled by default).

---

## Cilium Local Redirect Policy (`CiliumLocalRedirectPolicy`)

Redirects pod traffic destined to an IP/port or ClusterIP Service locally to node-local backend pod(s) in the **same namespace** (`cilium.io/v2`). Enable with `--set localRedirectPolicies.enabled=true`:

1. **`AddressMatcher`**: Matches non-Service IP + `toPorts` (e.g., `169.254.169.254:8080`). Restrict allowed CIDRs via `localRedirectPolicies.addressMatcherCIDRs`.
2. **`ServiceMatcher`**: Matches `serviceName` + `namespace` (ClusterIP) and replaces it with `LocalRedirect` entries to node-local pods (ideal for **NodeLocal DNSCache** running in non-hostNetwork mode).
- **Loop Prevention**: `skipRedirectFromBackend: true` prevents backend pods from looping back (requires **Linux kernel `>= 5.12`** for `SO_NETNS_COOKIE`).
- **Verify**: `cilium-dbg lrp list` and `cilium-dbg service list | grep LocalRedirect`.
- **Limitation**: In-place policy updates are **not supported**—delete and recreate the `CiliumLocalRedirectPolicy`.

---

## KPR Known Issues & Troubleshooting

- **Docker unpublished containers**: Socket-LB translates ClusterIP before netfilter, hitting Docker `raw/PREROUTING` drop rules.
- **NFS/SMB RWX to ClusterIP with socket-LB**: Requires kernel fixes (`Ubuntu >= 5.4.0-187 / 5.15.0-113 / 6.5.0-41`, `RHEL >= 8.10 / 9.4`).
- **Socket termination on deleted backends**: Requires `CONFIG_INET_DIAG`, `CONFIG_INET_UDP_DIAG`, `CONFIG_INET_DIAG_DESTROY`.
- **Masquerading**: Always pair `kubeProxyReplacement=true` with `bpf.masquerade=true` rather than iptables masquerading to avoid SNAT port collisions.
