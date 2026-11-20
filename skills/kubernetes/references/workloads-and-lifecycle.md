# Workloads & Pod Lifecycle

Workloads represent applications running on Kubernetes. Kubernetes provides distinct controllers suited for stateless, stateful, daemon, and batch architectures.

---

## 1. Pods: The Fundamental Building Block

A Pod encapsulates one or more co-located containers that share storage volumes, an IP address, and network port space (`localhost`).

### Pod Lifecycle Phases:
- `Pending`: Pod accepted by API server but one or more containers are not yet created or scheduled.
- `Running`: Pod bound to a node and all containers have been created. At least one container is running or in startup.
- `Succeeded`: All containers in the Pod completed successfully and will not restart.
- `Failed`: All containers have terminated, and at least one container terminated in failure.
- `Unknown`: State cannot be obtained (typically due to communication loss with the node).

### Container Categories:
1. **Application Containers**: Long-running application processes.
2. **Init Containers (`spec.initContainers`)**:
   - Run to completion sequentially before application containers start.
   - Ideal for setup scripts, schema migrations, or waiting for dependencies.
3. **Native Sidecar Containers (k8s 1.28+)**:
   - Defined inside `spec.initContainers` with `restartPolicy: Always`.
   - Start before app containers and remain running throughout the Pod's lifecycle (e.g., logging agents, service mesh proxies).

### Health Checks & Probes
- **Startup Probe (`startupProbe`)**:
  - Disables liveness and readiness probes until it succeeds.
  - Protects slow-starting legacy applications from being killed before completing initialization.
- **Liveness Probe (`livenessProbe`)**:
  - Determines if the container needs to be restarted. If it fails, the kubelet kills the container and initiates its restart policy.
- **Readiness Probe (`readinessProbe`)**:
  - Determines if a container is ready to accept network traffic. If it fails, the endpoint controller removes the Pod's IP from all matching Service Endpoints.

---

## 2. Workload Controllers

### A. Deployments (`apps/v1`)
Best for stateless applications (e.g., REST APIs, web apps, microservices).
- Manages an underlying `ReplicaSet` ensuring the desired number of Pod replicas exist.
- Supports declarative updates (`RollingUpdate` and `Recreate`).
- **Critical Configuration Fields**:
  - `strategy.rollingUpdate.maxSurge`: Max extra pods created during update (e.g., `25%`).
  - `strategy.rollingUpdate.maxUnavailable`: Max pods unavailable during update (set to `0` for zero-downtime rollouts).
  - `minReadySeconds`: Minimum seconds a newly created Pod must be ready without any container crashing before it is considered available. Prevents rolling updates from prematurely destroying old pods when new pods pass initial readiness but crash under load.
  - `progressDeadlineSeconds`: Time in seconds (default `600`) before Kubernetes reports `ProgressDeadlineExceeded` condition on a stalled rollout.
  - `revisionHistoryLimit`: Number of old ReplicaSets retained for rollback (default `10`).
  - `paused: true`: Pauses rollout to stage multiple changes without triggering unnecessary rolling update waves.

### B. StatefulSets (`apps/v1`)
Best for stateful applications requiring persistent identity (e.g., databases, Kafka, ZooKeeper).
- **Stable Network ID**: Predictable ordinal hostnames (`web-0`, `web-1`).
- **Ordered Deployment & Termination**: Starts and shuts down instances in strict numerical order (or in parallel when `podManagementPolicy: Parallel`).
- **Dedicated Storage**: Employs `volumeClaimTemplates` to provision unique, non-shared PVCs bound to each ordinal index.
- **PVC Retention Policy (`persistentVolumeClaimRetentionPolicy`)**:
  Controls lifecycle of PVCs created by `volumeClaimTemplates`:
  ```yaml
  persistentVolumeClaimRetentionPolicy:
    whenDeleted: Retain # Retain | Delete (when StatefulSet is deleted)
    whenScaled: Delete  # Retain | Delete (when StatefulSet is scaled down)
  ```
- **Ordinal Sharding (`ordinals.start`)**:
  Allows partitioning a single distributed system across multiple StatefulSets or clusters by starting the ordinal index at a non-zero number (e.g. `start: 3`).

### C. DaemonSets (`apps/v1`)
Ensures all (or subset) nodes run a copy of a Pod.
- Typical use cases: CNI network agents (Cilium, Calico), log collectors (FluentBit), node metric exporters (Prometheus node-exporter).
- Automatically responds as nodes are added or removed from the cluster.
- Supports rolling updates with `updateStrategy.rollingUpdate.maxUnavailable` and `maxSurge` (allowing canary upgrades of node daemons).

### D. Jobs & CronJobs (`batch/v1`)
- **Job**: Creates one or more Pods and tracks them to successful completion.
  - `completions`: Number of successfully finished pods required.
  - `parallelism`: Number of pods running concurrently.
  - `backoffLimit`: Retry attempts before marking the Job failed.
  - **`completionMode: Indexed`**: Each Pod gets an index from `0` to `completions-1` exported via the `JOB_COMPLETION_INDEX` environment variable (ideal for parallel batch processing and parameter sharding).
  - **`podFailurePolicy`**: Disregards infrastructure disruptions (like node eviction) from counting against `backoffLimit`, and fails immediately on known application exit codes (e.g. exit code 42).
- **CronJob**: Runs Jobs on a recurring schedule defined by a standard cron format (`schedule: "0 2 * * *"`).
  - `concurrencyPolicy`: `Allow`, `Forbid` (prevents overlapping runs), or `Replace`.

---

## 3. Graceful Termination & Shutdown Mechanics

When a Pod is terminated, a race condition naturally exists between the removal of the Pod IP from kube-proxy/EndpointSlices and the delivery of `SIGTERM` to the container process.

### Step-by-Step Termination Timeline:
1. User or controller requests Pod deletion (`kubectl delete pod`).
2. Pod status becomes `Terminating`.
3. Two independent asynchronous actions occur simultaneously:
   - **Action A (Endpoints Removal)**: The EndpointSlice controller removes the Pod IP from the Service endpoints; kube-proxy and Ingress controllers propagate this rule change across the cluster (takes 1–5 seconds).
   - **Action B (Container Notification)**: The kubelet executes the container's `preStop` hook, if configured.
4. Once `preStop` completes, the kubelet sends `SIGTERM` to PID 1 inside the container.
5. Application begins closing open connections and finishing in-flight requests.
6. Kubelet waits for `terminationGracePeriodSeconds` (default: 30s).
7. If the process is still running when the grace period expires, `SIGKILL` is sent immediately.

### Zero-Downtime PreStop Sleep Pattern
To guarantee zero dropped HTTP connections during rolling updates, add a brief sleep in the `preStop` hook to allow kube-proxy and ingress routing rules to propagate before the application stops accepting new connections:

```yaml
lifecycle:
  preStop:
    exec:
      command: ["/bin/sh", "-c", "sleep 10"]
```

### Readiness Gates (`spec.readinessGates`)
Allows external controllers (such as AWS Load Balancer Controller or custom ingress operators) to inject additional readiness checks. A Pod is not considered ready until all built-in container probes AND all external readiness gates evaluate to `True`.
