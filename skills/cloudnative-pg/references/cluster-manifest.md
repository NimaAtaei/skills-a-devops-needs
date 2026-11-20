# Cluster Spec & Configuration Guide (v1.30)

The `Cluster` resource (`apiVersion: postgresql.cnpg.io/v1`) is the core custom resource defining a PostgreSQL deployment in CloudNativePG.

## Key Sections of `.spec`

### 1. Instances & Images
```yaml
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:17.4
  # Alternatively, use an ImageCatalog or ClusterImageCatalog:
  # imageCatalogRef:
  #   apiGroup: postgresql.cnpg.io
  #   kind: ClusterImageCatalog
  #   name: postgresql
  #   major: 17
```

- **`instances`**: Number of pods (1 primary + N-1 standbys). Production standard is `3`.
- **`imageName`**: Official CloudNativePG PostgreSQL container images.

---

### 2. Storage Configuration
Separating data (`PGDATA`) and WAL (`pg_wal`) onto distinct storage classes and volumes is recommended for high-write workloads:

```yaml
spec:
  storage:
    size: 50Gi
    storageClass: standard-rwo
  walStorage:
    size: 20Gi
    storageClass: fast-nvme-rwo
```

- **PVC Expansion**: CNPG automatically handles online PVC resizing if the underlying CSI driver supports volume expansion.

---

### 3. Bootstrap Configuration
Defines how the cluster initializes:

#### Initializing from Scratch (InitDB)
```yaml
spec:
  bootstrap:
    initdb:
      database: app_db
      owner: app_user
      secret:
        name: app-user-credentials
      encoding: UTF8
      dataChecksums: true
      # Custom SQL hooks during initialization:
      postInitSQL:
        - "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
      postInitSQLRefs:
        configMapRefs:
          - name: superuser-init-scripts
            key: init.sql
      postInitApplicationSQL:
        - "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
      postInitApplicationSQLRefs:
        configMapRefs:
          - name: app-schema-scripts
            key: schema.sql
```

#### Bootstrapping from a Backup (Recovery)
```yaml
spec:
  bootstrap:
    recovery:
      source: cluster-backup-source
      # Optional: Point-In-Time-Recovery target timestamp
      # target:
      #   targetTime: "2026-11-20T12:00:00Z"
```

#### Bootstrapping via pg_basebackup (Existing Cluster)
```yaml
spec:
  bootstrap:
    pg_basebackup:
      source: existing-cluster
```

---

### 4. PostgreSQL Configuration & Parameters
Custom postgres configuration settings configured declaratively:

```yaml
spec:
  postgresql:
    parameters:
      shared_buffers: "1GB"
      work_mem: "16MB"
      maintenance_work_mem: "256MB"
      max_connections: "200"
      wal_compression: "zstd"
      ssl_ecdh_curve: "prime256v1" # Supported in 1.30
      pg_stat_statements.track: "all"
    # Pod Label-based Authentication (podSelectorRefs)
    podSelectorRefs:
      - name: payments-api-pods
        selector:
          matchLabels:
            app.kubernetes.io/name: payments-api
    pg_hba:
      # Allow payments API pods to authenticate via client TLS certificate
      - hostssl app_db app_user payments-api-pods cert
      - host all all all scram-sha-256
```

- Parameters marked as dynamic reload automatically without downtime (`pg_ctl reload`).
- Parameters requiring restart trigger a coordinated rolling restart managed by the operator.
- `primaryUpdateStrategy`: `unsupervised` (operator switches over and restarts automatically) or `supervised` (waits for manual administrator approval).
- `primaryUpdateMethod`: `switchover` (switches over primary role to standby before updating, minimizing downtime) or `restart` (in-place restart).

---

### 5. Services & Traffic Policies (`spec.managed.services`)

CloudNativePG allows full customization of its managed services, including configuring Kubernetes `internalTrafficPolicy` and `externalTrafficPolicy` to optimize network latency and preserve client source IPs.

```yaml
spec:
  managed:
    services:
      # Optionally disable unused default services to reduce EndpointSlice clutter
      disabledDefaultServices:
        - ro # Disable <cluster>-ro if no read-only workloads exist
      # Additional custom services with traffic policies
      additional:
        # Custom node-local service using internalTrafficPolicy: Local
        - serviceTemplate:
            metadata:
              name: cluster-prod-node-local-rw
              annotations:
                service.kubernetes.io/topology-mode: Auto
            spec:
              type: ClusterIP
              # Eliminates cross-node hops for co-located pods
              internalTrafficPolicy: Local
          selectorType: rw
          updateStrategy: patch

        # Custom public LoadBalancer service preserving client source IP
        - serviceTemplate:
            metadata:
              name: cluster-prod-public-rw
            spec:
              type: LoadBalancer
              # Avoids SNAT to preserve client IP
              externalTrafficPolicy: Local
          selectorType: rw
          updateStrategy: patch
```

---

### 6. Primary Lease Configuration (v1.30)
```yaml
spec:
  primaryLease:
    durationSeconds: 15
    renewIntervalSeconds: 5
    retryPeriodSeconds: 2
```
Ensures fast, serialized failover while protecting against simultaneous primary promotion during split-brain network partitioning.

---

### 6. Resources & Affinity
```yaml
spec:
  resources:
    requests:
      cpu: "1000m"
      memory: "2Gi"
    limits:
      cpu: "4000m"
      memory: "4Gi"
  affinity:
    enablePodAntiAffinity: true
    topologyKey: topology.kubernetes.io/zone
```
Guarantees CPU/Memory availability and prevents co-locating Postgres pods on the same Kubernetes host or failure zone.
