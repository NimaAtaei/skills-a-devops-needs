# Multi-Cluster Disaster Recovery & Replica Clusters (v1.30)

CloudNativePG supports cross-cluster and cross-region disaster recovery (DR) through **Replica Clusters**. A replica cluster is a distinct PostgreSQL cluster running in a secondary Kubernetes environment that continuously synchronizes from a primary cluster located elsewhere.

```text
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│     Primary Region / Cluster    │       │     Secondary DR Region         │
│                                 │       │                                 │
│  ┌───────────────────────────┐  │       │  ┌───────────────────────────┐  │
│  │ Primary Cluster (3 nodes) │  │       │  │ Replica Cluster (3 nodes) │  │
│  │  Active R/W Workloads     │  │       │  │  Continuous Standby       │  │
│  └─────────────┬─────────────┘  │       │  └─────────────▲─────────────┘  │
│                │ Continuous     │       │                │ Continuous     │
│                │ WAL Archiving  │       │                │ WAL Fetching   │
│                ▼                │       │                │                │
│         ┌──────────────┐        │       │                │                │
│         │ S3 / GCS /   │────────┼───────┼────────────────┘                │
│         │ Object Store │        │       │                                 │
│         └──────────────┘        │       │                                 │
└─────────────────────────────────┘       └─────────────────────────────────┘
```

---

## 1. Bootstrapping a Replica Cluster

A replica cluster can be initialized and kept in sync using two strategies:

### Strategy A: Object Store Replication (Recommended for Cross-Region)
The primary cluster archives WALs to cloud object storage (e.g., S3). The replica cluster downloads WAL segments continuously without requiring direct network connectivity between the two Kubernetes clusters.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: cluster-replica-dr
  namespace: database
spec:
  instances: 3
  imageName: ghcr.io/cloudnative-pg/postgresql:17.4

  storage:
    size: 100Gi
    storageClass: standard-rwo

  # Declare this cluster as a replica cluster
  replica:
    enabled: true
    source: primary-external-cluster

  bootstrap:
    recovery:
      source: primary-external-cluster

  externalClusters:
    - name: primary-external-cluster
      barmanObjectStore:
        destinationPath: "s3://company-pg-backups/cluster-production/"
        s3Credentials:
          accessKeyId:
            name: s3-backup-secret
            key: ACCESS_KEY_ID
          secretAccessKey:
            name: s3-backup-secret
            key: SECRET_ACCESS_KEY
```

### Strategy B: Direct Streaming Replication
If network peering (e.g., VPC Peering or VPN) exists between the two Kubernetes clusters, the replica cluster can stream WALs directly from the primary instance via PostgreSQL streaming replication protocol over TLS.

```yaml
spec:
  replica:
    enabled: true
    source: primary-streaming
  bootstrap:
    pg_basebackup:
      source: primary-streaming
  externalClusters:
    - name: primary-streaming
      connectionParameters:
        host: primary-cluster-rw.primary-k8s.example.com
        user: streaming_replica_user
        sslmode: verify-full
      sslKey:
        name: streaming-tls-secret
        key: tls.key
      sslCert:
        name: streaming-tls-secret
        key: tls.crt
      sslRootCert:
        name: streaming-tls-secret
        key: ca.crt
```

---

## 2. Promoting a Replica Cluster During Disaster Recovery

When the primary region suffers an outage:
1. Promote the replica cluster to become an independent primary:
   - Edit the replica cluster manifest and set `.spec.replica.enabled: false`.
2. The operator breaks the replica standby state and promotes the leading instance to an active read-write primary.
3. Switch application ingress/traffic to the secondary Kubernetes cluster.

---

## 3. Demoting and Resyncing After Outage Recovery
Once the primary datacenter is restored:
- Configure the original primary cluster as a replica cluster pointing to the new primary cluster's backup location or streaming endpoint.
- CloudNativePG handles rebuilding and syncing automatically without requiring manual `pg_rewind` invocations.
