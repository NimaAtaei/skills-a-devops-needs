# Storage, PVCs & Volume Snapshots

Kubernetes abstracts physical storage infrastructure, enabling portable workloads to request persistent disk without hardcoding cloud-specific volume IDs.

---

## 1. Storage Abstraction Hierarchy

```text
┌────────────────────────────────────────────────────────┐
│                   Storage Provisioner                  │
│       (AWS EBS CSI, GCE PD CSI, Azure Disk, Ceph)      │
└───────────────────────────┬────────────────────────────┘
                            │ Manages
                            ▼
┌────────────────────────────────────────────────────────┐
│                      StorageClass                      │
│   (provisioner, parameters, volumeBindingMode, reclaim)│
└───────────────────────────┬────────────────────────────┘
                            │ Dynamically provisions
                            ▼
┌────────────────────────────────────────────────────────┐
│                    PersistentVolume                    │
│                 (Cluster-level storage)                │
└───────────────────────────▲────────────────────────────┘
                            │ Bound 1-to-1
                            ▼
┌────────────────────────────────────────────────────────┐
│                 PersistentVolumeClaim                  │
│               (Namespace-scoped request)               │
└───────────────────────────▲────────────────────────────┘
                            │ Mounted into
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Pod Container Spec                   │
└────────────────────────────────────────────────────────┘
```

---

## 2. StorageClasses (`storage.k8s.io/v1`)

A `StorageClass` provides a way for administrators to describe the "classes" of storage they offer.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-nvme-ssd
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Delete
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
```

### Critical Parameters:
- **`volumeBindingMode: WaitForFirstConsumer`**: Delays volume provisioning until a Pod requesting the PVC is scheduled. This guarantees the storage is created in the exact availability zone where the Pod is placed, avoiding multi-AZ attach failures.
- **`allowVolumeExpansion: true`**: Allows expanding PVC capacity on-the-fly without recreating the PVC.
- **`reclaimPolicy`**:
  - `Delete` (default for dynamic storage): Underlying physical volume is deleted when the PVC is deleted.
  - `Retain`: Physical storage is preserved after the PVC is deleted for manual recovery.

---

## 3. PersistentVolumeClaims (`v1`)

Developers request storage by defining a PVC specifying access modes and capacity:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-storage
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: fast-nvme-ssd
  resources:
    requests:
      storage: 50Gi
```

### Access Modes:
- **`ReadWriteOnce` (RWO)**: Mounted as read-write by a single node.
- **`ReadOnlyMany` (ROX)**: Mounted read-only by multiple nodes simultaneously.
- **`ReadWriteMany` (RWX)**: Mounted read-write by many nodes simultaneously (requires NFS, CephFS, AWS EFS, or Azure Files).
- **`ReadWriteOncePod` (RWOP)**: Mounted as read-write by a single Pod across the entire cluster.

---

## 4. VolumeSnapshots (`snapshot.storage.k8s.io/v1`)

CSI drivers support point-in-time volume backups directly through Kubernetes custom resources.

### Taking a Snapshot:
```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: db-snapshot-pre-upgrade
spec:
  volumeSnapshotClassName: csi-aws-vsc
  source:
    persistentVolumeClaimName: database-storage
```

### Restoring from a Snapshot:
Specify the snapshot under `dataSource` when creating a new PVC:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: database-storage-restored
spec:
  storageClassName: fast-nvme-ssd
  dataSource:
    name: db-snapshot-pre-upgrade
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 50Gi
```
