# Configuration, Secrets & Resource Management

Decoupling configuration artifacts and credentials from container images makes applications portable across staging, testing, and production environments.

---

## 1. ConfigMaps & Secrets

### ConfigMaps (`v1`)
Used for non-confidential configuration key-value pairs or whole configuration files.

- Injected as environment variables (`env` or `envFrom`).
- Mounted as read-only volumes (`volumeMounts`). When mounted as a directory, updates to the ConfigMap propagate to the volume inside running containers automatically (subject to kubelet sync intervals).
- **`immutable: true`**: Setting `immutable: true` locks the ConfigMap against updates. This significantly reduces `kube-apiserver` load (by removing watch overhead) and prevents unexpected breaking changes across running workloads.

### Secrets (`v1`)
Used for sensitive data (tokens, passwords, TLS certificates).

- Base64 encoded in manifests; encrypted at rest when configured in `kube-apiserver` with an encryption provider (e.g., KMS, AES-CBC).
- **`immutable: true`**: Locks the secret from changes; recreating the secret with a hash-suffix (e.g. `secret-v2-abcde`) enables safer canary rollouts.
- **Secret Types**:
  - `Opaque`: Arbitrary user data.
  - `kubernetes.io/tls`: Public certificate (`tls.crt`) and private key (`tls.key`).
  - `kubernetes.io/dockerconfigjson`: Credentials for pulling private container images (`imagePullSecrets`).

---

## 2. Downward API

Allows containers to consume information about themselves or the cluster without client-side Kubernetes API interaction:

```yaml
env:
  - name: POD_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
  - name: POD_NAMESPACE
    valueFrom:
      fieldRef:
        fieldPath: metadata.namespace
  - name: POD_IP
    valueFrom:
      fieldRef:
        fieldPath: status.podIP
  - name: CPU_LIMIT
    valueFrom:
      resourceFieldRef:
        containerName: app
        resource: limits.cpu
```

---

## 3. Resource Management & Quality of Service (QoS)

Containers specify compute resource constraints using `requests` and `limits`:
- **CPU**: Measured in millicores (`1000m` = 1 vCPU core). Compressible resource (throttled when limit is reached).
- **Memory**: Measured in bytes / mebibytes (`512Mi`, `2Gi`). Incompressible resource (triggers `OOMKilled` termination when limit is exceeded).
- **Ephemeral Storage (`ephemeral-storage`)**: Manages container writable layer, logs, and `emptyDir` volumes (e.g. `requests.ephemeral-storage: 1Gi`, `limits.ephemeral-storage: 4Gi`). Kubelet evicts pods exceeding ephemeral storage limits.

### QoS Classes Assigned by Kubelet:
1. **`Guaranteed` (Highest Priority)**:
   - Every container in the Pod has both CPU and Memory requests and limits set, and `requests == limits`.
   - Never evicted unless the node runs out of memory and no lower-tier pods remain.
2. **`Burstable`**:
   - At least one container has a memory or CPU request, but `limits > requests` or limits are not set for all resources.
   - Evicted if exceeding requests during node resource pressure.
3. **`BestEffort` (Lowest Priority)**:
   - Neither requests nor limits are set for any container.
   - First candidates to be killed and evicted when a node experiences memory pressure.

---

## 4. Horizontal Pod Autoscaler (HPA) (`autoscaling/v2`)

The HorizontalPodAutoscaler automatically scales the number of Pod replicas in a Deployment or StatefulSet based on observed metrics (CPU, Memory, or custom application metrics like requests per second).

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-autoscaler
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300 # Wait 5 minutes to avoid flapping/thrashing
      policies:
        - type: Percent
          value: 10
          periodSeconds: 60
```

---

## 5. ResourceQuotas & LimitRanges

### ResourceQuota (`v1`)
Enforces hard resource consumption ceilings at the namespace level:

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: production
spec:
  hard:
    requests.cpu: "16"
    requests.memory: 32Gi
    limits.cpu: "32"
    limits.memory: 64Gi
    pods: "50"
    services.loadbalancers: "2"
```

### LimitRange (`v1`)
Enforces minimum, maximum, and default requests/limits for individual Pods/Containers in a namespace. Prevents developers from submitting unbounded `BestEffort` pods that consume excessive host resources.
