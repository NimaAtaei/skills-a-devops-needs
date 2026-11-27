# Cilium BGP Control Plane, LB IPAM & Egress Gateway (v1.20)

## BGP Control Plane (`cilium.io/v2`)

Advertises Pod CIDRs, Service VIPs (`ClusterIP`, `ExternalIP`, `LoadBalancerIP`), and interface IPs to ToR switches/routers via BGP. Does **not** program the kernel datapath.

- **Enable**: `--set bgpControlPlane.enabled=true` (and restart `ds/cilium`).
- **Verify**: `cilium bgp peers` or `cilium shell -- bgp/*` (note: legacy `cilium-dbg bgp` peers/routes commands were deprecated in v1.20).

### Core CRDs (all `apiVersion: cilium.io/v2`)

1. **`CiliumBGPClusterConfig` (Cluster-scoped)**:
   - Selects nodes via `spec.nodeSelector` and defines `spec.bgpInstances[]` (`name`, `localASN`, optional `localPort`, `peers[]`).
   - **Active-only by default**: `localPort` is unset so Cilium coexists with Bird/FRR; setting `localPort: 179` requires `CAP_NET_BIND_SERVICE` on `ciliumAgent`.
   - **Auto-Discovery**: `autoDiscovery: { mode: "DefaultGateway", defaultGateway: { addressFamily: ipv4|ipv6 } }` peers with the default gateway (creates only **1 BGP session per address family**; link-local gateways unsupported).

2. **`CiliumBGPPeerConfig`**:
   - **MD5 Auth (RFC-2385)**: `spec.authSecretRef` (Secret with `password` key in `bgpControlPlane.secretNamespace.name`, default `kube-system`). Requires no SNAT between agent pod IP and peer.
   - **Timers**: `connectRetryTimeSeconds` (default `120`, recommended `<= 5`), `holdTimeSeconds` (default `90`, min `9`), `keepAliveTimeSeconds` (default `30`, min `3`).
   - **EBGP Multihop**: `spec.ebgpMultihop: <ttl>` (default `1`).
   - **Graceful Restart**: `spec.gracefulRestart: { enabled: true, restartTimeSeconds: 120 }` (set `> cilium-agent` boot time).
   - **Transport**: `spec.transport: { peerPort: 179, sourceInterface: lo }`.
   - **Address Families**: `spec.families[]` (`afi: ipv4|ipv6`, `safi: unicast`, `advertisements` label selector). Without matching advertisements, **no prefixes are advertised**.

3. **`CiliumBGPAdvertisement`**:
   - `advertisementType`:
     - **`PodCIDR`**: Advertises node PodCIDR (Kubernetes or ClusterPool IPAM).
     - **`CiliumPodIPPool`**: Multi-pool IPAM (`io.cilium.podippool.namespace` / `.name` selectors).
     - **`Service`**: `service.addresses` (`ClusterIP`, `ExternalIP`, `LoadBalancerIP`). Honors `loadBalancerClass: io.cilium/bgp-control-plane` (or unset). `ClusterIP` honors `internalTrafficPolicy`; `ExternalIP`/`LoadBalancerIP` honor `externalTrafficPolicy` (with `Local`, withdraws `/32`/`/128` route when no local endpoint exists). Requires `kubeProxyReplacement=true` + `bpf.lbExternalClusterIP=true` for `ClusterIP`/`ExternalIP`. Supports `aggregationLengthIPv4` / `aggregationLengthIPv6` (ignored when `TrafficPolicy: Local`).
     - **`Interface`**: Advertises exact `/32` or `/128` IPs on an admin-up interface (`interface.name: lo`).
   - **Attributes**: `communities.standard` (`"65000:99"`), `communities.wellKnown` (`no-export`, `no-advertise`, `blackhole`, `planned-shut`, etc.), `communities.large` (`"64512:100:50"`), and `localPreference` (iBGP only).

4. **`CiliumBGPNodeConfigOverride`**:
   - `metadata.name` matches the Kubernetes Node name; overrides `routerID`, `localPort`, `localASN`, and `peers[*].localAddress`.
   - Router ID allocation mode: `bgpControlPlane.routerIDAllocation.mode` (`default` or `ip-pool` with `ipPool: "10.0.0.0/24"`).

---

## LoadBalancer IPAM (`CiliumLoadBalancerIPPool`)

Allocates IPs to `Service` `type: LoadBalancer` (pairs with BGP Control Plane or L2 Announcements):
- **CRD (`cilium.io/v2`, Cluster-scoped, short: `ippools`)**:
  - `spec.blocks[]`: `{ cidr: "10.0.10.0/24" }` or `{ start: "20.0.20.100", stop: "20.0.20.200" }`.
  - `allowFirstLastIPs: "No"` reserves network/broadcast IPs.
  - `disabled: true` stops new allocations while keeping existing ones.
  - `serviceSelector`: Matches Service labels or `io.kubernetes.service.namespace` / `io.kubernetes.service.name`.
- **Service Annotations**:
  - `lbipam.cilium.io/ips: "20.0.10.100"` (preferred over deprecated `spec.loadBalancerIP`).
  - `lbipam.cilium.io/sharing-key: "shared-vip"` (share IP across Services on non-conflicting ports).
  - `lbipam.cilium.io/sharing-cross-namespace: "ns1,ns2"` or `"*"` (must be set on **both** Services).
- **LoadBalancerClass**: Recognizes `io.cilium/bgp-control-plane`, `io.cilium/l2-announcer`, or unset (disable unset handling via `--set defaultLBServiceIPAM=none`).
- **Status & Conflicts**: Overlapping CIDRs mark the new pool `cilium.io/PoolConflict=True` (`cidr_overlap`). Services report `io.cilium/lb-ipam-request-satisfied`.

---

## Egress Gateway (`CiliumEgressGatewayPolicy`)

Routes egress traffic from selected pods to external CIDRs through dedicated gateway nodes with deterministic static source IPs.

### Prerequisites & Incompatibilities
- **Required**: `egressGateway.enabled=true`, `kubeProxyReplacement=true`, `bpf.masquerade=true` (and `cni.enableRouteMTUForCNIChaining=true` if CNI chaining).
- **Incompatible with**:
  - `kvstore` identity allocation (`identityAllocationMode` must be `crd`).
  - **ClusterMesh** (gateway node must reside in the same cluster).
  - **CiliumEndpointSlice** (GH#24833).
- **Startup caveat**: Brief delay on newly created pods before policy applies; initial packets may egress with pod/node IP.

### Policy Spec (`apiVersion: cilium.io/v2`, Cluster-scoped)
- **Never set `.metadata.namespace`**; select pod namespaces using `io.kubernetes.pod.namespace` in `selectors[].podSelector`.
- `destinationCIDRs[]` & `excludedCIDRs[]` (cluster pod/node/apiserver CIDRs are automatically excluded from SNAT).
- `egressGateway` (single) or `egressGateways[]` (multi-gateway, hashed by `CiliumEndpoint` UID):
  - `nodeSelector`: If multiple nodes match a single `egressGateway`, selects the **first lexically by node name**; if zero match, matching traffic is **dropped**.
  - Set **either** `interface: eth1` **or** `egressIP: 192.168.1.100` (assigned on node)—**never both**, or the policy is ignored! Omitting both uses the default-route interface's first IP.

### Troubleshooting & SNAT Port Exhaustion
- **Inspect active rules**: `kubectl -n kube-system exec ds/cilium -- cilium-dbg bpf egress list` (non-gateway nodes show `0.0.0.0`; gateway nodes show `Egress IP`).
- **SNAT Connection Limit**: Each `{egress-IP, remote IP, remote port}` tuple uses source ports in `(upper_bound(--node-port-range), 65535]`. With default `30000-32767`, max concurrent connections per tuple is **`32768`** (`65535 - 32767`).
- **Inspect NAT saturation**: `kubectl -n kube-system exec ds/cilium -- cilium-dbg shell -- db/show nat-stats` (top 30 NAT tuples, updated every 30s) and Prometheus metric `cilium_nat_endpoint_max_connection`.
