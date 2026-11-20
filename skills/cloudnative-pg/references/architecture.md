# CloudNativePG Architecture & High Availability (v1.30)

## Architectural Model

Unlike traditional Kubernetes database operators that inject sidecar containers (e.g., Patroni) or run stateful sets with rigid naming conventions, CloudNativePG integrates directly with PostgreSQL internals and Kubernetes native APIs.

```text
┌────────────────────────────────────────────────────────┐
│                   Kubernetes Cluster                   │
│                                                        │
│  ┌────────────────────────┐                            │
│  │ CloudNativePG Operator │ (Reconciles Cluster CRD)   │
│  └───────────┬────────────┘                            │
│              │ Manages Pods, PVCs, Services, Secrets   │
│              ▼                                         │
│  ┌─────────────────────────┐                           │
│  │  Kubernetes Primary     │                           │
│  │  Lease (Mutex)          │                           │
│  └───────────┬─────────────┘                           │
│              │                                         │
│       ┌──────┴───────────────┐                         │
│       ▼                      ▼                         │
│ ┌──────────────┐      ┌──────────────┐                 │
│ │ Instance Pod │      │ Instance Pod │                 │
│ │  (Primary)   │      │  (Standby)   │                 │
│ │ ┌──────────┐ │ WAL  │ ┌──────────┐ │                 │
│ │ │Instance  │─┼──────┼─│Instance  │ │                 │
│ │ │ Manager  │ │Replic│ │ Manager  │ │                 │
│ │ └────┬─────┘ │ation │ └────┬─────┘ │                 │
│ │      ▼       │      │      ▼       │                 │
│ │  PostgreSQL  │      │  PostgreSQL  │                 │
│ └──────────────┘      └──────────────┘                 │
└────────────────────────────────────────────────────────┘
```

### 1. The Instance Manager
- Runs as PID 1 inside the PostgreSQL pod container.
- Directly supervises the `postgres` process, monitors local health, and coordinates streaming replication.
- Handles local signals, configuration reloads (`pg_ctl reload`), and clean shutdowns without requiring external daemons.

### 2. Primary Lease (v1.30)
- In CloudNativePG 1.30, primary promotion and active service are serialized through a Kubernetes `Lease` resource named after the cluster (`<cluster-name>`).
- The primary instance manager holds this lease and renews it continuously.
- On clean pod termination, the primary immediately releases the lease, enabling instant standby promotion without waiting for the full TTL.
- During unplanned node failure, the standby instances wait until the lease expires before the operator selects and promotes the best candidate.
- Configurable via `.spec.primaryLease` (e.g., `durationSeconds`, `renewIntervalSeconds`, `retryPeriodSeconds`).

### 3. Replication & Quorum
CloudNativePG supports asynchronous and synchronous replication:
- **Asynchronous (Default)**: Primary writes locally and streams WAL to standbys. Minimum latency, potential small RPO window on primary failure.
- **Synchronous**: Configurable via `.spec.postgresql.syncReplicaElectionConstraint` or `synchronous_commit`:
  - `minSyncReplicas`: Minimum number of synchronous standbys required for commits.
  - `maxSyncReplicas`: Upper bound of synchronous standbys.
  - Helps achieve **RPO=0** guarantees in critical financial or transactional environments.

### 4. Pod Anti-Affinity & Topology Spread
- Automatically spreads cluster pods across different Kubernetes nodes or availability zones.
- Controlled via `.spec.affinity.enablePodAntiAffinity: true` and `.spec.affinity.topologyKey: "topology.kubernetes.io/zone"`.
- Prevents simultaneous failure of primary and replicas when an entire worker node or AZ becomes unavailable.

### 5. Services & Traffic Routing
CNPG automatically creates and manages dedicated Kubernetes Services:
- `<cluster-name>-rw`: Directs write (and read) traffic strictly to the active **Primary** instance.
- `<cluster-name>-ro`: Directs read-only traffic strictly to active **Standby** instances.
- `<cluster-name>-r`: Directs read traffic across **all** instances (Primary + Standbys).
- `<cluster-name>-any`: Headless service routing to all pod endpoints for internal replication and operator management.
