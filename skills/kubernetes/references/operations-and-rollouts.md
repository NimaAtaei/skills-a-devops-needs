# Operations, Rollouts & Cluster Maintenance

Managing Day-2 operations requires performing seamless rollouts, rollback procedures, and safe node maintenance without violating application service-level agreements.

---

## 1. Rolling Updates & Deployment Lifecycles

Whenever a Deployment's Pod template (`spec.template`) is modified (e.g., image bump, env var change), Kubernetes initiates a rolling update by creating a new ReplicaSet and gradually scaling it up while scaling down the old ReplicaSet.

### Essential Rollout Commands:

```bash
# Check rollout progress
kubectl rollout status deployment/my-api

# Inspect revision history
kubectl rollout history deployment/my-api

# View details of a specific previous revision
kubectl rollout history deployment/my-api --revision=3

# Roll back to the immediate previous revision
kubectl rollout undo deployment/my-api

# Roll back to a specific revision
kubectl rollout undo deployment/my-api --to-revision=2

# Trigger a zero-downtime rolling restart (e.g., to pick up Secret changes)
kubectl rollout restart deployment/my-api

# Pause and resume complex multi-step rollouts
kubectl rollout pause deployment/my-api
kubectl rollout resume deployment/my-api
```

---

## 2. PodDisruptionBudgets (PDB) (`policy/v1`)

A `PodDisruptionBudget` limits the number of Pods of a replicated application that can be down simultaneously from voluntary disruptions (e.g., node draining, cluster autoscaler scale-down, node upgrades).

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-pdb
  namespace: production
spec:
  minAvailable: 2 # Alternatively, use maxUnavailable: 1 or percentages ("80%")
  selector:
    matchLabels:
      app.kubernetes.io/name: my-api
```

---

## 3. Safe Node Maintenance & Draining

When performing kernel updates, patching worker nodes, or decommissioning hardware:

### Step 1: Cordon the Node
Prevents the scheduler from placing new Pods onto the node:
```bash
kubectl cordon <node-name>
```

### Step 2: Drain the Node
Evicts running Pods while respecting PodDisruptionBudgets:
```bash
kubectl drain <node-name> \
  --ignore-daemonsets \
  --delete-emptydir-data \
  --force
```
- `--ignore-daemonsets`: DaemonSets cannot be rescheduled onto other nodes; this flag allows draining to proceed.
- `--delete-emptydir-data`: Acknowledges that local ephemeral data in `emptyDir` volumes will be deleted.

### Step 3: Uncordon the Node
Once maintenance or reboot is complete, mark the node schedulable again:
```bash
kubectl uncordon <node-name>
```
