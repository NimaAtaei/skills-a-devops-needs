---
name: cloudnative-pg
description: >-
  Expert guide for managing PostgreSQL on Kubernetes with CloudNativePG (CNPG) v1.30.
  Use this skill when designing, provisioning, configuring, operating, troubleshooting,
  or backing up CloudNativePG clusters, including declarative roles, Barman Cloud PITR,
  PgBouncer pooling, and the cnpg kubectl plugin.
---

# CloudNativePG (CNPG) v1.30 Skill

CloudNativePG is the Kubernetes operator designed to run and orchestrate PostgreSQL database workloads natively on Kubernetes. It manages the full lifecycle of PostgreSQL instances without external clustering tools like Patroni, relying on Kubernetes primitives and PostgreSQL's built-in streaming replication.

## Key Capabilities (v1.30)

- **Native Architecture**: Embedded instance manager running inside the PostgreSQL pod (no Patroni, no sidecar overhead).
- **Primary Lease**: Serialized, safe primary election via Kubernetes `Lease` API to prevent split-brain during failovers.
- **Declarative Roles (`DatabaseRole` CRD)**: Standalone custom resource to manage roles with optional automated TLS client certificates.
- **Continuous Backup & PITR**: Continuous WAL streaming and scheduled base backups using Barman Cloud (S3, GCS, Azure Blob, Ceph/MinIO) and Volume Snapshots.
- **Connection Pooling**: Native PgBouncer connection pooling via the `Pooler` CRD.
- **Rolling & Major Upgrades**: Zero-downtime minor upgrades and in-place or pg_upgrade-based major upgrades.
- **Day-2 CLI**: Operational management with the `kubectl cnpg` plugin.

---

## Progressive Disclosure References

For deep dives, configuration specs, and runbooks, refer to:

- [Architecture & High Availability](./references/architecture.md): Controller pattern, Instance Manager, Primary Lease, quorum replication, and failover mechanics.
- [Cluster Spec & Configuration](./references/cluster-manifest.md): In-depth guide to `.spec` fields on the `Cluster` resource (storage, parameters, bootstrap, resources).
- [Backup, WAL Archiving & Recovery](./references/backup-recovery.md): Barman Cloud object stores, `Backup` & `ScheduledBackup` CRDs, Point-In-Time-Recovery (PITR).
- [Roles, Databases & Security](./references/roles-and-security.md): `DatabaseRole` CRD, `Database` CRD, mTLS client certificates, and RBAC.
- [PgBouncer Connection Pooling](./references/pooling-pgbouncer.md): Configuring `Pooler` resources, pooling modes, and service discovery.
- [Operations, CLI & Troubleshooting](./references/operations-and-cnpg.md): `kubectl cnpg` plugin commands, monitoring/metrics, logs inspection, and failure recovery.

---

## Production Manifest Examples

Ready-to-use manifests located in the [examples/](./examples/) directory:

- [Production HA Cluster](./examples/production-ha-cluster.yaml): 3-node HA cluster with synchronous replication, pod anti-affinity, and resource quotas.
- [Scheduled Backup Manifest](./examples/scheduled-backup.yaml): Automated nightly backups to S3-compatible storage.
- [Point-in-Time Recovery (PITR)](./examples/pitr-restore.yaml): Restoring a cluster to a specific timestamp from object storage.
- [Declarative Database & Roles](./examples/database-role-and-db.yaml): `DatabaseRole` and `Database` custom resources.
- [PgBouncer Pooler](./examples/pgbouncer-pooler.yaml): PgBouncer pooler setup connected to a CNPG cluster.

---

## Standard Operational Workflows

### 1. Provisioning a Cluster
1. Choose the Postgres major version and storage class (fast SSD/NVMe recommended for WAL and data).
2. Configure `.spec.instances` (minimum 3 for HA production).
3. Define backup object store credentials and bucket in `.spec.backup.barmanObjectStore`.
4. Apply the manifest and verify rollout using `kubectl cnpg status <cluster-name>`.

### 2. Performing a Failover or Switchover
- **Manual Switchover**:
  ```bash
  kubectl cnpg promote <cluster-name> <target-instance>
  # OR promote the best replica automatically:
  kubectl cnpg promote <cluster-name>
  ```
- **Automated Failover**: The operator detects primary failure, coordinates with the Kubernetes `Lease` object, and promotes the most up-to-date standby.

### 3. Monitoring & Status Checks
- Inspect detailed cluster health, replication lag, and WAL archiving:
  ```bash
  kubectl cnpg status <cluster-name>
  kubectl cnpg status <cluster-name> --verbose
  ```
- Prometheus metrics are exposed on port `9187` at `/metrics` by default.

### 4. Backup & Disaster Recovery
- **Trigger an immediate on-demand backup**:
  ```bash
  kubectl cnpg backup <cluster-name>
  ```
- **Perform PITR**: Deploy a new `Cluster` manifest with `.spec.bootstrap.recovery.source` pointing to the backup location and specify `.spec.bootstrap.recovery.target.targetTime`.
