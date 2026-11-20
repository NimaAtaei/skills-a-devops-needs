# Storage, Tablespaces & Benchmarking (v1.30)

PostgreSQL workloads require robust, predictable I/O throughput. CloudNativePG provides declarative volume provisioning, separate WAL and data paths, dynamic volume expansion, and native PostgreSQL tablespaces.

---

## 1. Storage Layout & Separate WAL

High-write transaction workloads benefit from isolating write-ahead logging (WAL) onto a separate physical volume:

```yaml
spec:
  # PGDATA volume
  storage:
    size: 200Gi
    storageClass: standard-rwo
  # pg_wal volume
  walStorage:
    size: 50Gi
    storageClass: high-iops-nvme
```

- When `walStorage` is defined, the operator mounts a dedicated PVC to the `pg_wal` path.
- When `walStorage` is omitted, WAL files reside inside the primary data PVC (`PGDATA/pg_wal`).

---

## 2. Dynamic Volume Expansion

CloudNativePG supports online volume expansion without pod recreation, provided the underlying Kubernetes CSI driver supports volume resizing (`allowVolumeExpansion: true`).

### How to Expand Storage
1. Edit the `Cluster` manifest and increase `.spec.storage.size` or `.spec.walStorage.size` (e.g., from `200Gi` to `300Gi`).
2. The operator patches the PVCs for all cluster instances.
3. The CSI driver expands the volume filesystem online while PostgreSQL continues running.

> **Note**: Decreasing PVC size is not supported by Kubernetes CSI drivers.

---

## 3. Declarative Tablespaces

PostgreSQL tablespaces allow database administrators to map specific tables, indexes, or temporary files to different physical disks. CloudNativePG manages tablespace directories and PVCs declaratively.

```yaml
spec:
  tablespaces:
    # Dedicated high-speed SSD volume for active transactional tables
    - name: fast_tablespace
      storage:
        size: 50Gi
        storageClass: fast-nvme-rwo
      owner:
        name: core_app_user

    # Temporary tablespace for large sort and hash operations
    - name: temp_tablespace
      storage:
        size: 20Gi
        storageClass: standard-rwo
      temporary: true
```

### Key Tablespace Features:
- **Temporary Tablespaces (`temporary: true`)**: Used by PostgreSQL when sorting queries exceed `work_mem`. Setting this routes spill-over disk operations away from the main `PGDATA` volume.
- **Ownership & Permissions**: The operator automatically assigns ownership and permissions matching the declared `owner.name`.

---

## 4. Benchmarking with the `cnpg` Plugin

CloudNativePG includes built-in benchmarking utilities to measure disk I/O and database transaction throughput before placing production traffic onto a cluster.

### A. Storage Benchmark (`fio`)
Run an automated flexible I/O tester on the target storage class:
```bash
# Benchmark random write latency and throughput
kubectl cnpg bench fio cluster-production \
  --job-name fio-storage-benchmark \
  --storage-class gp3-nvme \
  --size 10Gi
```

### B. Database Transaction Benchmark (`pgbench`)
Execute standardized PostgreSQL transaction load testing:
```bash
# Initialize pgbench tables with scale factor 50
kubectl cnpg bench pgbench cluster-production \
  --job-name pgbench-init \
  --db-name core_db \
  --initialize \
  --scale 50

# Run 10-minute read/write transaction benchmark with 20 concurrent clients
kubectl cnpg bench pgbench cluster-production \
  --job-name pgbench-run \
  --db-name core_db \
  --clients 20 \
  --time 600
```
