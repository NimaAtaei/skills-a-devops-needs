# Declarative Roles, Databases & Security (v1.30)

CloudNativePG 1.30 introduces standalone declarative role management via the `DatabaseRole` CRD alongside existing declarative database and user definitions.

---

## 1. Standalone Declarative Roles (`DatabaseRole` CRD)

Rather than maintaining all database users inside the monolithic `Cluster` spec, CNPG 1.30 allows managing roles independently:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: DatabaseRole
metadata:
  name: order-service-role
spec:
  cluster:
    name: cluster-prod
  name: order_service_user
  ensure: present # present | absent
  comment: "Application role for order processing service"
  login: true
  superuser: false
  inherit: true
  connectionLimit: 50
  passwordSecret:
    name: order-service-db-secret
  # Automated TLS Client Certificate Generation (New in 1.30)
  clientCertificate:
    secretName: order-service-tls-cert
    duration: 8760h # 1 year validity
```

### Highlights of `DatabaseRole`:
- **GitOps Decoupling**: Application microservice repositories can store their own `DatabaseRole` CRD manifest next to their Kubernetes `Deployment`.
- **Automated TLS Client Certificates**: When `clientCertificate` is configured, the operator automatically issues and signs a client certificate using the cluster's internal client CA, storing the cert and private key in the secret specified by `secretName`.
- **CEL Immutability**: The `.spec.cluster.name` reference is immutable once applied.

---

## 2. Declarative Databases (`Database` CRD)

Manage Postgres databases declaratively with ownership, encoding, and extension configuration:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Database
metadata:
  name: orders-database
spec:
  cluster:
    name: cluster-prod
  name: orders_db
  owner: order_service_user
  encoding: UTF8
  collate: C
  ctype: C
  extensions:
    - name: "pg_stat_statements"
      ensure: present
    - name: "uuid-ossp"
      ensure: present
```

---

## 3. Mutual TLS (mTLS) & Authentication

CloudNativePG enforces encrypted mTLS connections by default for all intra-cluster communication (streaming replication, instance management).

### Client Authentication Options
1. **Password Authentication (SCRAM-SHA-256)**:
   - Credentials stored in Kubernetes Secrets.
   - Configured in `pg_hba`:
     ```yaml
     postgresql:
       pg_hba:
         - hostssl all all all scram-sha-256
     ```
2. **Passwordless Client Certificate Authentication**:
   - Clients connect using TLS certificates signed by the cluster's client CA:
     ```yaml
     postgresql:
       pg_hba:
         - hostssl orders_db order_service_user all cert
     ```

---

## 4. Container & Pod Security
- **Non-root Execution**: PostgreSQL runs under UID `26` (postgres).
- **Read-Only Root Filesystem**: The container runs with a read-only root filesystem; only ephemeral and PVC storage are writable.
- **Seccomp & Capabilities**: All Linux capabilities are dropped (`capabilities.drop: ["ALL"]`) with `RuntimeDefault` seccomp profiles.
