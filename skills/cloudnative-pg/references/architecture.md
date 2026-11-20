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
- Runs as **PID 1** inside the PostgreSQL pod container, eliminating external supervisors or systemd.
- Directly supervises the `postgres` process, monitors local health, and coordinates streaming replication.
- Handles local signals (`SIGINT`, `SIGTERM`, `SIGKILL`), configuration reloads (`pg_ctl reload`), and probes:
  - **Liveness Probe (`:8000/healthz`)**: Confirms PID 1 is responsive and postgres is alive (`spec.livenessProbeTimeout`, default 30s).
  - **Readiness Probe**: Confirms the instance can accept traffic (RW for primary, RO for standbys).
- **Graceful Shutdown & Stop Delays**:
  - `spec.smartShutdownTimeout` (default 180s): Waits for active client connections to finish before initiating termination.
  - `spec.stopDelay` (default 30s): Time allocated for `pg_ctl stop -m fast` to flush buffers and checkpoint cleanly before falling back to `SIGKILL`.
- **Primary Isolation & Fencing**: Automatically fences or demotes postgres if quorum or lease ownership is lost to prevent split-brain write corruption.
- **Disk Full Safeguard**: If a PVC reaches 100% capacity, the instance manager halts incoming writes to protect the WAL sequence from disk corruption.

### 2. Primary Lease & Safe Election (v1.30)
- In CloudNativePG 1.30, primary promotion and active service are serialized through a Kubernetes `Lease` resource named after the cluster (`<cluster-name>`).
- The primary instance manager holds this lease and renews it continuously.
- On clean pod termination, the primary immediately releases the lease, enabling instant standby promotion without waiting for the full TTL.
- During unplanned node failure, the standby instances wait until the lease expires before the operator evaluates standby LSN positions and selects the most up-to-date candidate.
- **Failover & Switchover Timing Controls**:
  - `spec.failoverDelay` (default 0s): Grace period before initiating automated failover, preventing transient network blips from triggering unnecessary failovers.
  - `spec.switchoverDelay` (default 30s): Maximum time allowed for graceful switchover during planned maintenance or rolling updates.
  - `spec.primaryLease`: Customizes `durationSeconds` (default 15s), `renewIntervalSeconds` (default 5s), and `retryPeriodSeconds` (default 2s).

### 3. Replication Quorum & Durability (`spec.postgresql.synchronous`)
CloudNativePG provides fine-grained declarative synchronous replication controls:

```yaml
spec:
  postgresql:
    synchronous:
      method: any # any (quorum) | first (priority)
      number: 1   # Number of synchronous standbys required
      dataDurability: required # required (strict RPO=0) | preferred (fallback to async on standby failure)
      failoverQuorum: true    # Standbys participating in sync replication form exclusive candidate pool
```

- **`dataDurability: required`**: Guarantees strict **RPO=0**; transactions block indefinitely if the required number of synchronous standbys are unreachable.
- **`dataDurability: preferred`**: High durability with high availability; transactions fall back to asynchronous replication if no synchronous standby is reachable.

### 4. High Availability & Logical Decoding Replication Slots
- **Physical HA Replication Slots (`spec.replicationSlots.highAvailability`)**:
  - Automatically provisions physical replication slots on the primary for each standby (`_cnpg_` prefix, configurable via `slotPrefix`).
  - Ensures WAL segments are retained on the primary until acknowledged by standbys, even during network partitions (`updateInterval: 30s`).
- **Logical Decoding Replication Slots (`spec.replicationSlots.synchronizeLogicalDecoding`)**:
  - Synchronizes logical decoding replication slots across all standby instances:
    - PostgreSQL 17+: Employs native `synchronized_standby_slots`.
    - PostgreSQL 16 & below: Employs the `pg_failover_slots` extension.
  - Enables uninterrupted Change Data Capture (CDC) pipelines (e.g. Debezium, Kafka Connect) across primary failovers without losing decoding positions or re-streaming duplicate data.

### 5. Pod Anti-Affinity & Topology Spread
- Automatically spreads cluster pods across different Kubernetes nodes or availability zones.
- Controlled via `.spec.affinity.enablePodAntiAffinity: true` and `.spec.affinity.topologyKey: "topology.kubernetes.io/zone"`.
- Prevents simultaneous failure of primary and replicas when an entire worker node or AZ becomes unavailable.

### 6. Services & Traffic Routing
CNPG automatically creates and manages dedicated Kubernetes Services:
- `<cluster-name>-rw`: Directs write (and read) traffic strictly to the active **Primary** instance.
- `<cluster-name>-ro`: Directs read-only traffic strictly to active **Standby** instances.
- `<cluster-name>-r`: Directs read traffic across **all** instances (Primary + Standbys).
- `<cluster-name>-any`: Headless service routing to all pod endpoints for internal replication and operator management (enabled via `CREATE_ANY_SERVICE="true"`).
- Custom services with custom `internalTrafficPolicy` and `externalTrafficPolicy` can be configured via `spec.managed.services.additional`.
