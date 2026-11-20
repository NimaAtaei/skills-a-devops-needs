# Operations, CLI & Troubleshooting Runbooks

## 1. The `cnpg` kubectl Plugin

The `cnpg` plugin is the primary Day-2 operational tool for administering CloudNativePG clusters.

### Installation
```bash
# Via Krew:
kubectl krew install cnpg

# Verify installation:
kubectl cnpg version
```

### Essential Commands

| Command | Purpose |
| :--- | :--- |
| `kubectl cnpg status <cluster>` | Shows overall cluster status, primary instance, standby lag, and WAL archiving progress. |
| `kubectl cnpg status <cluster> --verbose` | In-depth diagnostic including pod status, PVC health, and replication parameters. |
| `kubectl cnpg promote <cluster> [pod]` | Manually switches over or promotes a standby to become the new primary. |
| `kubectl cnpg restart <cluster>` | Performs a coordinated rolling restart across all cluster instances. |
| `kubectl cnpg reload <cluster>` | Sends a `pg_ctl reload` signal to update dynamic Postgres parameters without restarting. |
| `kubectl cnpg backup <cluster>` | Triggers an immediate on-demand backup. |
| `kubectl cnpg backup <cluster> --dry-run` | (v1.30+) Outputs the `Backup` CRD YAML without executing it. |
| `kubectl cnpg logs <cluster> -f` | Tails streaming logs from the cluster instances. |
| `kubectl cnpg psql <cluster>` | Opens an interactive `psql` session to the primary instance. |
| `kubectl cnpg fencing on <cluster> <pod>` | Fences a misbehaving pod to prevent traffic and replication while debugging. |
| `kubectl cnpg fencing off <cluster> <pod>` | Removes fencing from an instance. |
| `kubectl cnpg destroy <cluster> <pod-index>` | Safely deletes a replica instance and its PVC, prompting CNPG to rebuild it from scratch. |

---

## 2. Upgrades

### Minor Upgrades (e.g., Postgres 17.2 -> 17.4)
1. Update `.spec.imageName` to the new image tag.
2. The operator executes an automated rolling update:
   - Standby instances are updated one by one.
   - The operator switches over primary duties to one of the newly upgraded standbys.
   - The old primary is updated and becomes a standby.

### Major Upgrades (e.g., Postgres 16 -> 17)
There are two strategies:
1. **In-place Upgrade with `pg_upgrade`**:
   - Supported natively by CloudNativePG using `.spec.imageName` bump while preserving the data volume, executing `pg_upgrade` during maintenance.
2. **Blue-Green / Replica Cluster**:
   - Spin up a new target cluster with the new major version using `.spec.bootstrap.pg_basebackup` or logical replication (`Publication` / `Subscription` CRDs).
   - Cut traffic over with minimal downtime.

---

## 3. Common Troubleshooting Runbooks

### Issue 1: Split-Brain or Promotion Failure
- **Symptom**: Pod fails to become primary, or primary lease remains in contention.
- **Diagnostic**:
  ```bash
  kubectl get lease <cluster-name> -o yaml
  kubectl describe pod <primary-pod>
  ```
- **Remedy**:
  - Verify that the instance manager can communicate with the Kubernetes API server.
  - If a dead primary still holds the lease after abnormal node shutdown, the lease will automatically expire after `durationSeconds` (default: 15s).

### Issue 2: WAL Archiving Failing or Backlog Accumulating
- **Symptom**: `kubectl cnpg status` reports failed WAL archiving or WAL disk usage is spiking.
- **Diagnostic**:
  ```bash
  kubectl cnpg status <cluster-name>
  kubectl logs <primary-pod> -c postgres
  ```
- **Remedy**:
  - Verify object store credentials Secret (`ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`).
  - Check network connectivity and egress firewalls from the pod to the S3/GCS/Azure endpoint.
  - Ensure the destination bucket exists and permissions (`s3:PutObject`, `s3:GetObject`) are granted.

### Issue 3: Replication Lag Between Primary and Standbys
- **Symptom**: Read-only queries served by standby instances return stale data.
- **Diagnostic**:
  ```bash
  kubectl cnpg status <cluster-name>
  ```
- **Remedy**:
  - Check IOPS and disk throughput on standby PVCs using `iostat` or node metrics.
  - Check network bandwidth between worker nodes.
  - Consider increasing `walStorage` size and enabling `wal_compression: zstd`.
