# Backup, WAL Archiving & Disaster Recovery (v1.30)

CloudNativePG provides enterprise disaster recovery via continuous WAL archiving and periodic base backups using Barman Cloud or Volume Snapshots.

---

## 1. Barman Cloud Object Store Integration

CloudNativePG streams WAL files directly to cloud object storage (AWS S3, Google Cloud Storage, Azure Blob Storage, MinIO, or Ceph S3).

### Object Store Configuration in `Cluster` Spec
```yaml
spec:
  backup:
    barmanObjectStore:
      destinationPath: "s3://my-postgres-backups/cluster-prod/"
      endpointURL: "https://s3.eu-central-1.amazonaws.com"
      s3Credentials:
        accessKeyId:
          name: s3-credentials
          key: ACCESS_KEY_ID
        secretAccessKey:
          name: s3-credentials
          key: SECRET_ACCESS_KEY
      wal:
        compression: zstd # gzip | bzip2 | snappystream | zstd
        maxParallel: 4    # High-throughput parallel archiving
        encryption: aws:kms # Optional: server-side encryption
      data:
        compression: zstd
        immediateCheckpoint: false
        jobs: 2
      # endpointCA:
      #   name: custom-minio-ca
      #   key: ca.crt
    retentionPolicy: "30d"
```

- **Continuous WAL Archiving**: Every completed WAL segment (16MB) is automatically compressed and uploaded to object storage.
- **RPO Window**: Down to seconds when using streaming backup and parallel archiving.

---

## 2. On-Demand & Scheduled Backups

### On-Demand Backup (`Backup` CRD)
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata:
  name: backup-manual-pre-migration
spec:
  cluster:
    name: cluster-prod
  method: barmanObjectStore # barmanObjectStore | volumeSnapshot | plugin
  target: prefer-standby    # primary | prefer-standby (offloads backup I/O from primary)
  online: true              # true (hot backup) | false (cold backup: isolates standby)
```
Or initiate via CLI:
```bash
# Trigger immediate backup (preferring standby to avoid primary load):
kubectl cnpg backup cluster-prod --backup-name backup-manual-pre-migration

# Preview the Backup resource manifest without creating it (1.30+):
kubectl cnpg backup cluster-prod --dry-run
```

### Automated Backups (`ScheduledBackup` CRD)
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: daily-midnight-backup
spec:
  schedule: "0 0 0 * * *" # Daily at midnight
  backupOwnerReference: self
  cluster:
    name: cluster-prod
  target: prefer-standby
  method: barmanObjectStore
  immediate: true
```

> **Important**: In CNPG 1.30+, CEL validation ensures the `.spec.cluster.name` field is immutable on `ScheduledBackup` and `Backup` resources.

---

## 3. Point-in-Time Recovery (PITR)

To restore a database cluster to a previous point in time:
1. Define a new `Cluster` manifest.
2. In `.spec.bootstrap.recovery`, reference the object store containing the backups and specify the `recoveryTarget`.

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: cluster-restored-prod
spec:
  instances: 3
  storage:
    size: 50Gi
    storageClass: standard-rwo

  bootstrap:
    recovery:
      source: cluster-prod-backup-source
      recoveryTarget:
        # Strategy A: Target specific UTC timestamp
        targetTime: "2026-11-20T10:30:00Z"
        # Strategy B: Target specific Log Sequence Number (LSN)
        # targetLSN: "16/B374D848"
        # Strategy C: Target specific named restore point
        # targetName: "restore_point_before_migration"
        # Strategy D: Target immediately after base backup recovery
        # targetImmediate: true
        exclusive: false

  externalClusters:
    - name: cluster-prod-backup-source
      barmanObjectStore:
        destinationPath: "s3://my-postgres-backups/cluster-prod/"
        s3Credentials:
          accessKeyId:
            name: s3-credentials
            key: ACCESS_KEY_ID
          secretAccessKey:
            name: s3-credentials
            key: SECRET_ACCESS_KEY
```

---

## 4. Volume Snapshot Backups

If your Kubernetes cluster has a CSI driver supporting volume snapshots (e.g., AWS EBS CSI, GCP Persistent Disk CSI, Ceph CSI):
- Configure `.spec.backup.volumeSnapshot.className: "<snapshot-class-name>"`.
- **Online Snapshots (`online: true`)**: The operator issues `pg_backup_start()`, triggers parallel CSI snapshots of `PGDATA`, `pg_wal`, and all tablespace volumes, and closes with `pg_backup_stop()`.
- **Offline Snapshots (`online: false`)**: The operator temporarily isolates a standby replica, shuts down its postgres process cleanly, takes volume snapshots, and restarts postgres.
- Volume snapshots enable instantaneous base backups and instant restores for multi-terabyte databases.
