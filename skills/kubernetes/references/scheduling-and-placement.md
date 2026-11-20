# Scheduling & Advanced Pod Placement

The `kube-scheduler` determines which worker node executes each Pod based on resource availability, hardware requirements, failure domains, and co-location policies.

---

## 1. Taints and Tolerations

Taints allow a **Node** to repel a set of Pods. Tolerations allow **Pods** to schedule onto nodes with matching taints.

### Taint Effects:
- `NoSchedule`: Unless tolerated, new pods will not schedule on the node. Existing running pods are unaffected.
- `PreferNoSchedule`: Soft penalty; scheduler avoids placing non-tolerating pods on the node if alternatives exist.
- `NoExecute`: Unless tolerated, non-tolerating pods are immediately evicted from the node.

### Applying a Taint:
```bash
kubectl taint nodes node-gpu-01 dedicated=gpu:NoSchedule
```

### Tolerating a Taint in Pod Spec:
```yaml
tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "gpu"
    effect: "NoSchedule"
  # Eviction grace period toleration (overrides default 300s node eviction on failure)
  - key: "node.kubernetes.io/not-ready"
    operator: "Exists"
    effect: "NoExecute"
    tolerationSeconds: 60
  - key: "node.kubernetes.io/unreachable"
    operator: "Exists"
    effect: "NoExecute"
    tolerationSeconds: 60
```

---

## 2. Node Affinity

Constrains which nodes your Pod can be scheduled on based on node labels.

- **`requiredDuringSchedulingIgnoredDuringExecution` (Hard Requirement)**: Pod will not be scheduled unless the rule is satisfied.
- **`preferredDuringSchedulingIgnoredDuringExecution` (Soft Preference)**: Scheduler attempts to satisfy the rule, but places the Pod elsewhere if no matching node exists.

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: topology.kubernetes.io/zone
              operator: In
              values:
                - us-east-1a
                - us-east-1b
```

---

## 3. Pod Affinity & Anti-Affinity

Places Pods relative to **other Pods** based on labels.

### Pod Anti-Affinity for High Availability
Ensures replicas of the same application are never scheduled on the same physical host or failure zone:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: web-api
          topologyKey: "kubernetes.io/hostname"
```

---

## 4. Topology Spread Constraints

Topology Spread Constraints provide fine-grained, even distribution of Pods across failure domains (regions, zones, racks, or nodes).

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: "topology.kubernetes.io/zone"
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app.kubernetes.io/name: web-api
```

### Key Parameters:
- **`maxSkew`**: The maximum allowed difference in the number of matching Pods between any two topology domains. A `maxSkew: 1` guarantees virtually balanced distribution.
- **`topologyKey`**: The key of node labels defining failure domains (e.g., `topology.kubernetes.io/zone` for availability zones, `kubernetes.io/hostname` for worker nodes).
- **`whenUnsatisfiable`**:
  - `DoNotSchedule` (Hard constraint): Pod remains `Pending` if spreading cannot be satisfied.
  - `ScheduleAnyway` (Soft constraint): Places the Pod on the node that minimizes skew.

---

## 5. Pod Priority & Preemption (`scheduling.k8s.io/v1`)

When cluster resources are exhausted, high-priority workloads can preempt (evict) lower-priority workloads.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority-apps
value: 1000000
preemptionPolicy: PreemptLowerPriority # PreemptLowerPriority | Never
globalDefault: false
description: "Mission-critical user-facing applications"
```
Attach to Pod via `spec.priorityClassName: high-priority-apps`.

---

## 6. Pod Scheduling Gates (`spec.schedulingGates`)

Scheduling gates allow admission controllers or external operators to pause scheduling until prerequisite conditions are satisfied (e.g., pre-warming storage or allocating external cloud resources).

```yaml
spec:
  schedulingGates:
    - name: "example.com/network-provisioned"
```
The scheduler leaves the Pod in `SchedulingGated` state until the external controller removes the gate from the Pod's `spec.schedulingGates`.
