# Security, RBAC & Pod Security Standards

Kubernetes implements defense-in-depth across the **4C Security Model**: Cloud/Infrastructure, Cluster, Container, and Code.

---

## 1. Pod Security Standards (PSS) & Admission

Pod Security Standards define three policy levels covering the spectrum of privilege:

1. **`Privileged`**:
   - Completely unrestricted. Allows containers to run as root, execute in host namespaces, and access host devices.
   - Reserved strictly for infrastructure daemons (e.g., CNI plugins, CSI storage drivers).
2. **`Baseline`**:
   - Prevents known privilege escalations with minimal configuration friction.
   - Blocks `hostNetwork`, `hostPID`, `hostIPC`, and root-level device capabilities.
3. **`Restricted` (Recommended for Application Workloads)**:
   - Enforces hardening best practices:
     - Must run as non-root user (`runAsNonRoot: true`).
     - Must drop all Linux capabilities (`capabilities.drop: ["ALL"]`).
     - Root filesystem must be read-only (`readOnlyRootFilesystem: true`).
     - Seccomp profile must be `RuntimeDefault` or `Localhost`.

### Namespace Label Enforcement:
Configure admission levels directly on the Namespace:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

---

## 2. Hardened Container Security Context

A production-grade container spec implementing the `Restricted` PSS profile:

```yaml
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
    fsGroupChangePolicy: "OnRootMismatch" # Avoids slow recursive chown on large volumes
    seccompProfile:
      type: RuntimeDefault
    appArmorProfile:
      type: RuntimeDefault # Native AppArmor profile (k8s 1.30+)
  containers:
    - name: api
      image: ghcr.io/org/api:v1.0.0
      securityContext:
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities:
          drop:
            - ALL
      volumeMounts:
        - name: tmp
          mountPath: /tmp # Writable ephemeral storage
  volumes:
    - name: tmp
      emptyDir: {}
```

---

## 3. Role-Based Access Control (RBAC)

RBAC regulates access to API resources based on the roles assigned to users, groups, or ServiceAccounts.

### Scope: Namespaced vs. Cluster-Wide
| Resource | Scope | Purpose |
| :--- | :--- | :--- |
| **`Role`** | Namespaced | Defines permissions within a specific namespace. |
| **`RoleBinding`** | Namespaced | Grants permissions of a Role to subjects in that namespace. |
| **`ClusterRole`** | Cluster-Wide | Defines permissions across all namespaces (or non-namespaced resources like Nodes). |
| **`ClusterRoleBinding`** | Cluster-Wide | Grants permissions of a ClusterRole across the entire cluster. |

### Principle of Least Privilege:
Avoid wildcard verbs (`*`) or resources (`*`). Specify exact API groups, resources, and verbs:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployment-manager
  namespace: production
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]
```

---

## 4. ServiceAccounts & Token Projection

Every Pod runs under the identity of a `ServiceAccount` (`spec.serviceAccountName`).

- **Disable Token Auto-Mounting**: If your application does not call the Kubernetes API, disable automatic token mounting:
  ```yaml
  automountServiceAccountToken: false
  ```
- **Projected Service Account Tokens**: Modern Kubernetes clusters automatically issue short-lived, time-bound, audience-restricted tokens projected into Pod volumes, replacing static non-expiring Secret tokens.
