---
name: cloudnative-pg
description: >-
  Comprehensive guide and operational runbook for PostgreSQL on Kubernetes using
  CloudNativePG (CNPG) v1.30. Activate this skill when planning, deploying, configuring,
  operating, backing up, or troubleshooting CloudNativePG clusters, including declarative
  roles, Barman Cloud PITR, PgBouncer pooling, tablespaces, replica clusters, and the
  cnpg kubectl CLI plugin.
---

# CloudNativePG (CNPG) v1.30 Skill

CloudNativePG is the leading Kubernetes operator for deploying and managing high-availability PostgreSQL database clusters natively. It uses PostgreSQL's built-in streaming replication and an in-pod instance manager without external sidecars like Patroni.

## Core Capabilities (v1.30)

- **Native Architecture**: PID 1 instance manager supervises PostgreSQL directly, coordinating replication, smart connection draining, and failover without external daemons.
- **Primary Lease & Promotion Gates**: Kubernetes `Lease` API acts as a serialized promotion gate and mutex to guarantee split-brain-free failovers.
- **Declarative Roles (`DatabaseRole` CRD)**: Standalone custom resource to manage database roles with automated TLS client certificates.
- **Continuous Backups & PITR**: Continuous WAL streaming and base backups via Barman Cloud (S3, GCS, Azure Blob, MinIO) and Volume Snapshots.
- **Traffic Policies & Custom Services**: Declarative management of default and additional services supporting `internalTrafficPolicy: Local` (zero-hop node routing) and `externalTrafficPolicy: Local` (preserving client source IP).
- **Logical Replication Slot Synchronization**: HA replication slots and logical decoding slot replication for zero-data-loss CDC pipelines (Debezium/Kafka).
- **Multi-Cluster Disaster Recovery**: Replica clusters replicating asynchronously across Kubernetes clusters or cloud regions.
- **Declarative Tablespaces**: Decouple physical I/O by assigning tablespaces to dedicated storage classes and temporary disks.
- **Connection Pooling**: Native PgBouncer integration via the `Pooler` CRD (`auth_user` parameter support in 1.30).
- **Extensibility (CNPG-I)**: gRPC plugin specification for operator and instance manager extensions.
- **Day-2 Operations**: Diagnostic and operational CLI using the `kubectl cnpg` plugin (`switchover`, `promote`, `backup --dry-run`, `fencing`, `bench`, `maintenance`).

---

## Documentation & Progressive Disclosure Guides

Each guide covers specific architectural, operational, and configuration topics in depth:

1. [Architecture & High Availability](./references/architecture.md)
   - Controller reconciliation loop, Instance Manager internals, Primary Lease, synchronous/asynchronous replication quorum, and service routing (`-rw`, `-ro`, `-r`).

2. [Cluster Spec & Configuration](./references/cluster-manifest.md)
   - Deep dive into `.spec` on `Cluster` CRD (`postgresql.cnpg.io/v1`): storage layout, bootstrap options (initdb, recovery, pg_basebackup), dynamic parameters, and resource management.

3. [Installation, Webhooks & Operator Lifecycle](./references/installation-and-lifecycle.md)
   - Deploying via Helm, static manifests, or `cnpg install generate`. Cluster-wide vs single-namespace scoping, admission webhooks, GKE firewall rules, and cert-manager integration.

4. [Backup, WAL Archiving & Recovery](./references/backup-recovery.md)
   - Barman Cloud object store setup (S3/GCS/Azure/MinIO), `Backup` and `ScheduledBackup` CRDs, Point-in-Time Recovery (PITR), and CSI volume snapshots.

5. [Declarative Roles, Databases & Security](./references/roles-and-security.md)
   - `DatabaseRole` CRD with automated TLS client certificates, `Database` CRD, mTLS encryption, SCRAM-SHA-256 password secrets, and pod security hardening.

6. [Storage, Tablespaces & Benchmarking](./references/storage-tablespaces.md)
   - Separate WAL storage, dynamic online volume expansion, declarative tablespaces (fast SSDs and temporary sort disks), and `cnpg bench` (fio and pgbench).

7. [Multi-Cluster DR & Replica Clusters](./references/replica-clusters-dr.md)
   - Cross-region disaster recovery, bootstrapping replica clusters via object stores or streaming, promotion failover, and demotion resyncing.

8. [PgBouncer Connection Pooling](./references/pooling-pgbouncer.md)
   - `Pooler` CRD, transaction vs session pooling modes, `auth_user` parameter, high-availability pooler deployments, and service endpoints.

9. [Monitoring, Metrics & Observability](./references/monitoring-and-metrics.md)
   - Built-in Prometheus exporter (port 9187), `PodMonitor` CRD, user-defined custom SQL metrics in ConfigMaps, search path security, and `pgaudit` audit logging.

10. [CNPG-I Plugin Framework](./references/cnpg-i-plugins.md)
    - CloudNativePG Interface (CNPG-I) gRPC specification, plugin topologies (sidecar vs standalone), and the Barman Cloud plugin roadmap.

11. [Operations, CLI & Troubleshooting](./references/operations-and-cnpg.md)
    - Complete `kubectl cnpg` plugin runbook: `status`, `promote`, `restart`, `reload`, `backup --dry-run`, `psql`, `fencing`, and common diagnostic remedies.

---

## Production Manifest Examples

Ready-to-deploy YAML manifests located in [examples/](./examples/):

- [Production HA Cluster](./examples/production-ha-cluster.yaml): 3-node HA cluster with separate WAL storage, pod anti-affinity, and S3 backups.
- [Scheduled Backup](./examples/scheduled-backup.yaml): Automated daily scheduled backup via `ScheduledBackup` CRD.
- [Point-in-Time Recovery (PITR)](./examples/pitr-restore.yaml): Cluster restoration manifest targeting a specific UTC timestamp.
- [Declarative Roles & Database](./examples/database-role-and-db.yaml): `DatabaseRole` with auto-issued client cert and `Database` CRD.
- [PgBouncer Pooler](./examples/pgbouncer-pooler.yaml): Dedicated PgBouncer pooler service.
- [Replica Cluster (DR)](./examples/replica-cluster-dr.yaml): Cross-region disaster recovery cluster syncing via S3.
- [Tablespaces Cluster](./examples/tablespaces-cluster.yaml): High-throughput cluster utilizing dedicated SSD and temporary tablespaces.
- [Custom Services & Traffic Policy](./examples/custom-services-traffic-policy.yaml): Custom services with `internalTrafficPolicy: Local` and `externalTrafficPolicy: Local`.
- [Logical Replication Slots (CDC)](./examples/logical-replication-slots.yaml): HA and logical decoding slots for Debezium / Kafka CDC failover.
- [Custom Metrics ConfigMap](./examples/custom-metrics-configmap.yaml): Custom Prometheus metrics tracking table bloat and long-running queries.
- [Operator Helm Values](./examples/operator-helm-values.yaml): Production values file for deploying the `cnpg` Helm chart.

---

## Quick Operational Cheatsheet

```bash
# Check cluster health, replication lag, and archiving status
kubectl cnpg status <cluster-name>

# Perform a controlled switchover to promote a standby instance
kubectl cnpg promote <cluster-name>

# Coordinated rolling restart (maintains HA)
kubectl cnpg restart <cluster-name>

# Reload dynamic PostgreSQL parameters (zero downtime)
kubectl cnpg reload <cluster-name>

# Trigger on-demand backup (or preview manifest with --dry-run)
kubectl cnpg backup <cluster-name>
kubectl cnpg backup <cluster-name> --dry-run

# Open direct psql session to the primary
kubectl cnpg psql <cluster-name>

# Fence an instance for maintenance or deep inspection
kubectl cnpg fencing on <cluster-name> <pod-name>
kubectl cnpg fencing off <cluster-name> <pod-name>
```
