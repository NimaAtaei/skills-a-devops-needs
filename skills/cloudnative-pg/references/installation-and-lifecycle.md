# Operator Installation, Webhooks & Lifecycle (v1.30)

## 1. Installation Methods

CloudNativePG is deployed as a Kubernetes operator managing `Cluster`, `Backup`, `Pooler`, and related CRDs across your cluster.

### Method A: Helm Chart (Recommended for Production)
The official Helm chart is hosted on ArtifactHub / GitHub Pages:

```bash
# Add the CloudNativePG Helm repository
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo update cnpg

# Install the operator into its dedicated namespace
helm upgrade --install cnpg \
  --namespace cnpg-system \
  --create-namespace \
  cnpg/cloudnative-pg
```

### Method B: Static Manifests with Server-Side Apply
```bash
kubectl apply --server-side -f \
  https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.30/releases/cnpg-1.30.0.yaml
```

### Method C: Custom Installation with the `cnpg` CLI Plugin
Generate customized manifests (e.g., watching a single namespace instead of cluster-wide):
```bash
# Generate manifest watching only the 'databases' namespace
kubectl cnpg install generate \
  --namespace cnpg-system \
  --watch-namespace databases > cnpg-namespaced.yaml

kubectl apply -f cnpg-namespaced.yaml
```

---

## 2. Operator Scoping: Cluster-Wide vs Single Namespace

- **Cluster-Wide Mode (Default)**:
  - A single operator deployment monitors PostgreSQL clusters across all Kubernetes namespaces.
  - Requires ClusterRole and ClusterRoleBinding permissions.
- **Single-Namespace Mode**:
  - The operator restricts its watch and reconciliation loop to the namespace specified by `--watch-namespace`.
  - Useful in multi-tenant clusters or strict RBAC enterprise environments where cluster-wide permissions cannot be granted.

---

## 3. Webhooks & TLS Certificates

CloudNativePG depends on Kubernetes Mutating and Validating Admission Webhooks to validate specifications (including CEL immutability rules in 1.30) and set default values.

### TLS Options for Webhooks
1. **Operator-Managed Internal CA (Default)**:
   - The operator automatically creates self-signed certificates and rotates them periodically.
   - Zero-configuration; recommended for standard installations.
2. **cert-manager Integration**:
   - For enterprise PKI pipelines, you can disable the internal certificate manager and inject certificates issued by `cert-manager`.
   - Set `.webhook.certificateSecretName` and annotate webhooks with `cert-manager.io/inject-ca-from`.

### Cloud Provider Caveats (e.g., GKE Private Clusters)
On Google Kubernetes Engine (GKE) private clusters, the control plane communicates with worker nodes only over port `443` or `10250` by default.
- CloudNativePG webhook runs on target port `9443`.
- **Resolution**: Add a firewall rule allowing TCP ingress on port `9443` from the GKE control plane master CIDR to your worker node pool.

---

## 4. Operator Upgrades

When upgrading CloudNativePG versions (e.g., 1.29 to 1.30):
1. **Apply CRD Updates First**:
   ```bash
   kubectl apply --server-side -f https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.30/releases/cnpg-1.30.0.yaml
   ```
2. **Upgrade the Operator Pod**:
   - The controller deployment performs a rolling update.
   - **Crucially**: Running PostgreSQL clusters and instances are **not restarted** when the operator deployment restarts. The instance manager continues running inside each pod independently.
