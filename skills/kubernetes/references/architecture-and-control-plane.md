# Kubernetes Cluster Architecture & Control Plane

Kubernetes coordinates a highly available, distributed cluster of computers connected to work as a unified unit.

```text
┌─────────────────────────────────────────────────────────────┐
│                        Control Plane                        │
│                                                             │
│   ┌───────────────┐     ┌──────────────┐     ┌───────────┐  │
│   │ kube-apiserver│◀───▶│    etcd      │     │   cloud-  │  │
│   └───▲───────▲───┘     │ (Key-Value)  │     │ controller│  │
│       │       │         └──────────────┘     │  manager  │  │
│       ▼       ▼                              └───────────┘  │
│  ┌─────────┐ ┌───────────────┐                              │
│  │  kube-  │ │kube-controller│                              │
│  │scheduler│ │    manager    │                              │
│  └─────────┘ └───────────────┘                              │
└───────┬──────────────┬──────────────────────────────────────┘
        │              │
        ▼              ▼
┌──────────────────┐ ┌──────────────────┐
│   Worker Node    │ │   Worker Node    │
│ ┌──────────────┐ │ │ ┌──────────────┐ │
│ │   kubelet    │ │ │ │   kubelet    │ │
│ └──────────────┘ │ │ └──────────────┘ │
│ ┌──────────────┐ │ │ ┌──────────────┐ │
│ │  kube-proxy  │ │ │ │  kube-proxy  │ │
│ └──────────────┘ │ │ └──────────────┘ │
│ ┌──────────────┐ │ │ ┌──────────────┐ │
│ │  Container   │ │ │ │  Container   │ │
│ │Runtime (CRI) │ │ │ │Runtime (CRI) │ │
│ └──────────────┘ │ │ └──────────────┘ │
│ ┌───┐ ┌───┐ ┌──┐ │ │ ┌───┐ ┌───┐ ┌──┐ │
│ │Pod│ │Pod│ │..│ │ │ │Pod│ │Pod│ │..│ │
│ └───┘ └───┘ └──┘ │ │ └───┘ └───┘ └──┘ │
└──────────────────┘ └──────────────────┘
```

---

## 1. Control Plane Components

The control plane's components make global decisions about the cluster (e.g., scheduling), detect and respond to cluster events, and reconcile desired state with actual state.

### A. `kube-apiserver`
- Exposes the Kubernetes HTTP API (RESTful JSON/protobuf).
- The only component that directly reads and writes to `etcd`.
- **Request Lifecycle**: Authentication (cert, OIDC, webhook) -> Authorization (RBAC, Webhook) -> Mutating Admission -> Schema Validation -> Validating Admission -> Persistence.
- Horizontally scalable and stateless. Multiple instances sit behind an external network load balancer.

### B. `etcd`
- Consistent, distributed, and highly available key-value store holding the complete state of the cluster.
- Uses the Raft consensus algorithm. Quorum requires `(N/2) + 1` nodes (typically 3 or 5 nodes in production).
- **Disaster Recovery**: Regular snapshots using `etcdctl snapshot save` are mandatory before major cluster upgrades.

### C. `kube-scheduler`
- Watches for newly created unscheduled Pods (`spec.nodeName` is empty).
- Assigns each Pod to an optimal node in two phases:
  1. **Filtering (Predicates)**: Eliminates nodes that do not satisfy Pod constraints (resource requests, taints, ports, affinity).
  2. **Scoring (Priorities)**: Ranks surviving nodes to determine the best placement.

### D. `kube-controller-manager`
- Runs core controller processes in a single binary. Each controller acts as a control loop comparing actual cluster state with desired state:
  - **Node Controller**: Detects node outages and manages eviction timeouts.
  - **Job Controller**: Watches for Job objects and creates Pods to run tasks to completion.
  - **EndpointSlice Controller**: Populates EndpointSlice objects connecting Services to Pods.
  - **ServiceAccount Controller**: Creates default accounts for new namespaces.

### E. `cloud-controller-manager`
- Embeds cloud-specific control logic (e.g., AWS, GCP, Azure, OpenStack).
- Separates cloud provider integrations from Kubernetes core code.

---

## 2. Node Components

Worker node components run on every node, maintaining running pods and providing the Kubernetes runtime environment.

### A. `kubelet`
- The primary agent that runs on each node in the cluster.
- Registers the node with the API server.
- Watches `PodSpecs` assigned to its node and ensures containers described within them are running and healthy.
- Communicates with the container runtime via the **Container Runtime Interface (CRI)** gRPC protocol.
- Executes container health probes (liveness, readiness, startup).

### B. `kube-proxy`
- Network proxy that runs on each node, implementing the Kubernetes `Service` abstraction.
- Maintains network packet filtering rules on the host to route connection requests directed to Service IPs (`ClusterIP`, `NodePort`) to backend Pod IPs.
- Backends supported: `iptables`, `ipvs` (higher performance for clusters with thousands of services), and `nftables`.

### C. Container Runtime
- The underlying container engine executing container processes.
- Must implement the Container Runtime Interface (CRI).
- Modern production runtimes include `containerd` and `CRI-O`. Docker Engine is accessed via `cri-dockerd` if required.
