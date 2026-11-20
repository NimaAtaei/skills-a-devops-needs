# kubectl Conventions & Kubernetes API Standards

Mastering `kubectl` idioms and understanding the underlying Kubernetes API machinery enables rapid manifest authoring, precise querying, and safe declarative management.

---

## 1. Declarative Management & Dry-Run Manifest Authoring

### Server-Side Apply vs. Client-Side Apply
- **Client-Side Apply (`kubectl apply -f manifest.yaml`)**:
  - Uses the `kubectl.kubernetes.io/last-applied-configuration` annotation.
  - Conflicts arise when multiple tools manage the same resource.
- **Server-Side Apply (`kubectl apply --server-side -f manifest.yaml`)**:
  - Tracked directly by the API server using **Field Management**.
  - Automatically identifies conflicts when two controllers or manifests attempt to manage the exact same field.

### Rapid Manifest Scaffolding with `--dry-run=client`
Never write YAML completely from scratch; generate starter manifests:

```bash
# Generate a Deployment manifest:
kubectl create deployment web-api \
  --image=ghcr.io/org/api:v1.0.0 \
  --replicas=3 \
  --dry-run=client -o yaml > deployment.yaml

# Generate a Service manifest matching an existing deployment:
kubectl expose deployment web-api \
  --port=80 \
  --target-port=8080 \
  --type=ClusterIP \
  --dry-run=client -o yaml > service.yaml

# Generate a Secret manifest from literals:
kubectl create secret generic app-secrets \
  --from-literal=DB_PASSWORD="super-secret-pass" \
  --dry-run=client -o yaml > secret.yaml

# Generate a ConfigMap from a local file:
kubectl create configmap app-config \
  --from-file=config.json \
  --dry-run=client -o yaml > configmap.yaml
```

---

## 2. Advanced Filtering, Sorting & JSONPath

### Custom Columns
Display only the specific fields you need:
```bash
kubectl get pods -o custom-columns=NAME:.metadata.name,NODE:.spec.nodeName,STATUS:.status.phase,IP:.status.podIP
```

### Sorting Resources
```bash
# Sort events by creation timestamp:
kubectl get events --sort-by='.metadata.creationTimestamp'

# Sort pods by restart count:
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'
```

### JSONPath Querying
```bash
# Extract all Pod IPs:
kubectl get pods -o jsonpath='{.items[*].status.podIP}'

# Extract container images used in all deployments:
kubectl get deployments -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[*].image}{"\n"}{end}'
```

---

## 3. Kubernetes API Versioning: GVK & GVR

Every Kubernetes object belongs to an API schema defined by its **Group, Version, and Kind (GVK)**:

- **Group**: The collection of related functionality (e.g., `apps`, `networking.k8s.io`, `batch`, or `""` core).
- **Version**: The maturity stage of the API (`v1alpha1`, `v1beta1`, `v1`).
- **Kind**: The concrete object schema (e.g., `Deployment`, `Service`, `CronJob`).
- **Resource (GVR)**: The plural lowercase name used in REST endpoints and CLI invocations (e.g., `deployments`, `services`, `cronjobs`).

### API Maturity Guarantees:
- **`alpha` (`v1alpha1`)**: Experimental; disabled by default. Subject to change or removal without notice.
- **`beta` (`v1beta1`)**: Enabled by default; well-tested. Subject to deprecation rules (deprecated across at least 3 releases before removal).
- **`stable` (`v1`)**: Production-ready; API guarantees backwards compatibility across future Kubernetes versions.
