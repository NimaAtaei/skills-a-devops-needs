# Cilium Architecture & eBPF Datapath (v1.20)

## Overview

Cilium is an open-source, cloud-native networking, observability, and security solution for container workloads built on Linux kernel **eBPF (Extended Berkeley Packet Filter)**. eBPF allows sandboxed bytecode programs to run inside the Linux kernel—verified by the in-kernel eBPF verifier and compiled via JIT—without modifying kernel source code or loading custom kernel modules.

### Why eBPF Over `iptables` / `IPVS`?

- **`iptables` limitations**: Evaluates rules sequentially (`O(N)`). High pod/service churn forces rewriting tens of thousands of rules, causing latency, CPU spikes, and connection blips. Filters on IP/port without L7 context.
- **`IPVS` limitations**: Uses hash tables (`O(1)`) for service LB, but still relies on `iptables` for packet filtering and SNAT/masquerading, and lacks L7 visibility.
- **eBPF advantage**: Hooks directly into kernel layers (**XDP**, **tc / tcx**, **socket layer / cgroupv2**). Lookups operate in `O(1)` via in-kernel BPF hash maps, decoupling security from IP addresses via **Security Identities** and supporting transparent L7 inspection via Envoy.

```text
┌───────────────────────────────────────────────────────────────────┐
│                         USER SPACE                                │
│                                                                   │
│  ┌─────────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │  cilium-agent   │   │ cilium-operator  │   │  Hubble Relay  │  │
│  │ (eBPF loader,   │   │ (IPAM, GC,       │   │  & Hubble UI   │  │
│  │  policy, Hubble │   │  Gateway/Ingress │   │  (cluster-wide │  │
│  │  server, Envoy) │   │  CRD sync)       │   │   flow graph)  │  │
│  └────────┬────────┘   └──────────────────┘   └───────▲────────┘  │
│           │ BPF Map Updates / RingBuf                 │ gRPC 4244 │
├───────────┼───────────────────────────────────────────┼───────────┤
│           ▼             LINUX KERNEL                  │           │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │               Socket Layer (cgroup v2)                      │  │
│  │        Socket-LB (connect4/6, sendmsg, recvmsg)             │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │           Traffic Control (tc / tcx) & netkit               │  │
│  │     Endpoint Policy, Conntrack, Service Routing, NAT        │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │             eXpress Data Path (XDP)                         │  │
│  │      High-speed Load Balancing & DDoS Defense               │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             ▼                                     │
│                     Network Interface                             │
└───────────────────────────────────────────────────────────────────┘
```

---

## Core Architecture Components

### 1. `cilium-agent` (DaemonSet)

Runs on every node in the cluster:
- Listens to Kubernetes API / kvstore events (Pods, Services, NetworkPolicies, Endpoints, CiliumNodes).
- Probes Linux kernel features at startup, compiles/loads eBPF bytecode into kernel hooks, and updates eBPF maps.
- Assigns and enforces numerical **Security Identities** for pods and endpoints.
- Embeds the **Hubble server** (exposes gRPC flow API on TCP `4244` and Prometheus metrics on `9962`/`9965`).
- Coordinates with **Envoy** (`cilium-envoy` DaemonSet or embedded) for L7 HTTP/gRPC/DNS/TLS policy enforcement and Ingress/Gateway API.

### 2. `cilium-operator` (Deployment)

Runs once per cluster (active-passive HA); **not** in the critical path for packet forwarding or policy decisions:
- Cluster-wide IPAM management (`cluster-pool`, `multi-pool`, cloud ENI/Azure IPAM).
- Garbage collection of stale security identities, `CiliumEndpoint`s, and BPF state.
- Gateway API & Ingress controller reconciliation and TLS Secret sync (`cilium-secrets`).
- ClusterMesh service discovery synchronization (`clustermesh-apiserver` / `kvstoremesh` coordination).
- *If temporarily unavailable*: Existing workloads keep forwarding normally, though new Pod IPAM allocation and kvstore heartbeat updates (`cilium/.heartbeat`) pause.

### 3. Cilium CNI Plugin (`cilium-cni`)

Invoked by the container runtime (`containerd` / `CRI-O`) on pod creation/deletion:
- Creates pod network namespace and attaches a `veth` pair (default) or **`netkit`** device (`bpf.datapathMode=netkit`, Beta on kernel `>= 6.8` using `tcx` + BPF links).
- Calls the local `cilium-agent` API to configure the pod's eBPF datapath, LB entries, and policies.

### 4. Debug Client (`cilium-dbg`) vs. `cilium` CLI

- **`cilium-dbg`**: Installed inside `cilium-agent` pods; talks to the local agent REST API and inspects kernel eBPF maps (`cilium-dbg status`, `cilium-dbg bpf lb list`).
- **`cilium` CLI**: Remote cluster management and installation tool running from your workstation using `kubeconfig` (`cilium install`, `cilium status`, `cilium connectivity test`).

### 5. Data Store: Kubernetes CRDs vs. Key-Value Store (`etcd`)

- **Kubernetes CRDs (Default)**: Stores Cilium state (`CiliumEndpoint`, `CiliumIdentity`, `CiliumNode`) directly in Kubernetes API objects. Recommended for most clusters.
- **Key-Value Store (`etcd >= 3.1.0`, Optional)**: Dedicated or shared etcd cluster for improved scalability on very large clusters.

---

## Life of a Packet in the eBPF Datapath

1. **Endpoint to Endpoint (Local)**: Source pod egress traverses endpoint policy -> service LB -> destination endpoint ingress policy (and optional L7 Envoy proxy). With socket-layer enforcement active for TCP, once the handshake reaches `ESTABLISHED`, subsequent packets bypass repeated endpoint policy checks and traverse only L7 policy if configured.
2. **Egress from Endpoint**: Local endpoint -> endpoint policy -> optional encapsulation (`cilium_vxlan` / `cilium_geneve`) or native routing -> optional transparent encryption (WireGuard / IPsec / Ztunnel).
3. **Ingress to Endpoint**: Arriving on host NIC -> optional XDP LB -> optional decryption / decapsulation -> endpoint ingress policy (using source identity from tunnel header or `ipcache` map) -> optional L7 proxy -> pod socket.

---

## The Identity-Based Security Model

Cilium decouples security from IP addresses:

1. **Labels as Identity**: Pods are identified by Kubernetes metadata labels (e.g., `app=frontend`, `io.kubernetes.pod.namespace=prod`). Non-identifying metadata (`pod-template-hash`, `controller-revision-hash`, `annotation.*`, `statefulset.kubernetes.io/pod-name`, etc.) is excluded by default.
2. **Numerical Security Identity**: All pods sharing identical security-relevant labels receive the **same numerical Security Identity** across the cluster. Scaling from 1 to 1,000 replicas creates zero extra policy map entries.
3. **eBPF Policy Enforcement**: Allowed tuples `(Source_ID, Dest_ID, Port, Proto)` are evaluated in `O(1)` inside `cilium_policy_v3_*` maps.

### Reserved & Well-Known Identities

| Identity ID | Name | Meaning |
|-------------|------|---------|
| `0` | `reserved:unknown` | Identity could not be derived |
| `1` | `reserved:host` | Local node host namespace + `hostNetwork` pods |
| `2` | `reserved:world` | Any external IP outside the cluster |
| `3` | `reserved:unmanaged` | Endpoints not managed by Cilium (started before Cilium) |
| `4` | `reserved:health` | Cilium health check endpoints (`cilium-health`) |
| `5` | `reserved:init` | Bootstrapping endpoint before labels/identity are resolved |
| `6` | `reserved:remote-node` | Any remote cluster node (and remote `hostNetwork` pods) |
| `7` | `reserved:kube-apiserver` | Kubernetes API server endpoint |
| `8` | `reserved:ingress` | Cilium-managed Envoy Ingress / Gateway API proxy |
| `102` | `kube-dns` | Well-known identity (`kube-system`, SA `kube-dns`) |
| `103` | `kube-dns` (EKS) | Well-known identity (EKS `eks.amazonaws.com/component=kube-dns`) |
| `104` | `core-dns` | Well-known identity (`kube-system`, SA `coredns`) |
| `105` | `cilium-operator` | Well-known identity (`<cilium-namespace>`, SA `cilium-operator`) |
| `106` | `core-dns` (EKS) | Well-known identity (EKS `eks.amazonaws.com/component=coredns`) |

---

## Core eBPF Maps & Default Capacities

| Map Name | Scope | Default Limit | Override Flag |
|----------|-------|---------------|---------------|
| Connection Tracking | node | `512k` TCP / `256k` UDP | `--bpf-ct-global-tcp-max`, `--bpf-ct-global-any-max` |
| NAT | node | `512k` (max `2/3` of CT total) | `--bpf-nat-global-max` |
| Neighbor Table | node | `512k` | `--bpf-neigh-global-max` |
| IP Cache | node | `512k` | — |
| Auth | node | `512k` | `--bpf-auth-map-max` |
| Service Load Balancer | node | `64k` | `--bpf-lb-map-max` |
| Service Backends / Source Ranges / Affinity | node | `64k` each | — |
| Endpoints | node | `64k` | — |
| Policy | endpoint | `16k` per endpoint | `--bpf-policy-map-max` |
| IPv4 / IPv6 Fragmentation | node | `8k` each | `--bpf-fragments-map-max` |
| IPv4 / IPv6 Masq / Egress Policy / Node | node | `16k` each | — |

- **Dynamic Map Sizing**: `--bpf-map-dynamic-size-ratio` (e.g., `0.0025` = 0.25% of system memory, min `131072`) scales CT, NAT, Neighbor, and reverse-socket maps automatically.
- **Note**: Changing map sizes on a running node requires restarting `cilium-agent` and disrupts active connections while maps re-allocate.

---

## Linux Kernel & System Requirements (v1.20)

- **Architectures**: **AMD64** and **AArch64**.
- **Minimum Kernel**: **Linux `>= 5.10`** for the `cilium/cilium` container image (or `>= 4.18` on RHEL 8.10). Native non-container deployments also require **clang+LLVM `>= 18.1`**.
- **Advanced Feature Kernel Requirements**:
  - `>= 5.10`: WireGuard, Host-Routing, Multicast (Beta, AMD64)
  - `>= 5.12`: Local Redirect Policy `skipRedirectFromBackend` (`SO_NETNS_COOKIE`)
  - `>= 5.18`: Pod BBR congestion control (Bandwidth Manager)
  - `>= 5.19`: IPv6 BIG TCP
  - `>= 6.0`: Multicast (Beta, AArch64)
  - `>= 6.3`: IPv4 BIG TCP
  - `>= 6.8`: `netkit` device mode (Beta)
- **eBPF Filesystem**: `/sys/fs/bpf` must be mounted as `bpffs` (auto-mounted by Cilium if missing, or pre-mount via `/etc/fstab` `bpffs /sys/fs/bpf bpf defaults 0 0`).
- **Required Kernel Configs**: `CONFIG_BPF=y`, `CONFIG_BPF_SYSCALL=y`, `CONFIG_BPF_JIT=y`, `CONFIG_BPF_EVENTS=y`, `CONFIG_NET_CLS_BPF=y`, `CONFIG_NET_CLS_ACT=y`, `CONFIG_NET_SCH_INGRESS=y`, `CONFIG_DEBUG_INFO_BTF=y`, `CONFIG_CGROUPS=y`, `CONFIG_CGROUP_BPF=y`, `CONFIG_PERF_EVENTS=y`, `CONFIG_SCHEDSTATS=y`.
