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
        compression: gzip
        maxParallel: 2
      data:
        compression: gzip
        immediateCheckpoint: false
        jobs: 2
    retentionPolicy: "30d"
```

- **Continuous WAL Archiving**: Every completed WAL segment (16MB) is automatically compressed and uploaded to object storage.
- **RPO Window**: Typically less than 5 minutes, or down to seconds when using streaming backup.

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
```
Or initiate via CLI:
```bash
# Trigger immediate backup:
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
  immediate: true
```

> **Important**: In CNPG 1.30+, CEL validation ensures the `.spec.cluster.name` field is immutable on `ScheduledBackup` and `Backup` resources.

---

## 3. Point-in-Time Recovery (PITR)

To restore a database cluster to a previous point in time:
1. Define a new `Cluster` manifest.
2. In `.spec.bootstrap.recovery`, reference the object store containing the backups and specify the target timestamp.

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
      target:
        targetTime: "2026-11-20T10:30:00Z" # ISO-8601 UTC timestamp

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
- Volume snapshots provide near-instantaneous base backups for multi-terabyte databases, while WAL files are still archived to object storage to enable PITR.
