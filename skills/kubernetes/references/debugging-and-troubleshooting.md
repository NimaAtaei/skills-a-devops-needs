# Debugging & Troubleshooting Runbooks

When a Kubernetes workload misbehaves, follow this systematic diagnostic tree to isolate the root cause.

---

## 1. Pod Failure States & Root Causes

### A. `CrashLoopBackOff`
- **Symptom**: Container repeatedly starts, crashes, and restarts with exponential backoff delay.
- **Diagnostic Steps**:
  ```bash
  # Check container logs from current and previous crashed instances:
  kubectl logs <pod-name> -c <container>
  kubectl logs <pod-name> -c <container> --previous

  # Inspect exit code and reason:
  kubectl describe pod <pod-name>
  ```
- **Common Causes**:
  - Exit Code `1`: Unhandled application exception or missing environment variable.
  - Exit Code `137`: Process terminated by `SIGKILL` (often Out Of Memory).
  - Exit Code `143`: Process terminated by `SIGTERM` (graceful shutdown or liveness probe failure).

### B. `OOMKilled` (Exit Code 137)
- **Symptom**: Container abruptly terminated; `describe pod` shows `Reason: OOMKilled`.
- **Root Cause**: Container memory consumption exceeded `resources.limits.memory`.
- **Remedy**: Increase memory limit or investigate application heap memory leaks using profiling tools.

### C. `ImagePullBackOff` / `ErrImagePull`
- **Symptom**: Pod stuck before container startup.
- **Common Causes**:
  - Typo in image name or tag.
  - Missing or incorrect `imagePullSecrets` for private registries.
  - Rate limiting by container registry (e.g., Docker Hub anonymous limits).

### D. `Pending`
- **Symptom**: Pod accepted but never scheduled onto any node.
- **Diagnostic Steps**:
  ```bash
  kubectl describe pod <pod-name>
  # Read the Events section at the bottom of the output
  ```
- **Common Causes**:
  - Insufficient CPU or Memory on all worker nodes.
  - PersistentVolumeClaim failed to bind (e.g., storage class missing or zone mismatch).
  - NodeSelector, NodeAffinity, or Taints preventing scheduling.

---

## 2. Interactive & Ephemeral Debugging

When a container image is stripped of shells and debugging tools (distroless/scratch):

### Attach an Ephemeral Debug Container (`kubectl debug`)
Inject a specialized debugging container into the Pod's running network and process namespace without restarting the Pod:

```bash
kubectl debug -it <pod-name> \
  --image=nicolaka/netshoot:latest \
  --target=<target-container-name>
```
- Shares the process namespace (`--target`), allowing tools like `strace`, `lsof`, `gdb`, and `ps` to inspect the main application container.
- Includes network tools: `curl`, `dig`, `tcpdump`, `iperf`, `netstat`.

### Debugging a Broken Node:
```bash
kubectl debug node/<node-name> -it --image=busybox
```

---

## 3. Service & DNS Troubleshooting

If applications cannot communicate with a Service:

1. **Verify Service Endpoints**:
   ```bash
   kubectl get endpoints <service-name>
   kubectl get endpointslices -l kubernetes.io/service-name=<service-name>
   ```
   - If endpoints are empty: check whether `spec.selector` on the Service exactly matches the `metadata.labels` on the target Pods.

2. **Verify Cluster DNS Resolution**:
   Run an interactive test pod:
   ```bash
   kubectl run test-dns --rm -it --image=busybox:1.28 --restart=Never -- nslookup <service-name>.<namespace>.svc.cluster.local
   ```
   - If DNS fails: verify CoreDNS pods are healthy in `kube-system`:
     ```bash
     kubectl get pods -n kube-system -l k8s-app=kube-dns
     ```

3. **Verify Port Mappings**:
   - `spec.ports[*].port`: The port exposed by the Service.
   - `spec.ports[*].targetPort`: The port the application process is listening on inside the container.
