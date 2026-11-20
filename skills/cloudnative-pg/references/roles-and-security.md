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
    enabled: true
    secretName: order-service-tls-cert
    duration: 8760h     # 1 year validity
    renewBefore: 720h   # Renew automatically 30 days before expiration
    secretTemplate:
      metadata:
        labels:
          app.kubernetes.io/name: order-service
  inRoles:
    - application_role
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
  # Reclaim policy when CR is deleted: Retain (preserve data) or Delete (drop DB)
  reclaimPolicy: Retain
  extensions:
    - name: "pg_stat_statements"
      ensure: present
    - name: "uuid-ossp"
      ensure: present
```

---

## 3. Mutual TLS (mTLS) & The 4 Certificate Authorities

CloudNativePG enforces encrypted mTLS connections by default for all intra-cluster communication (streaming replication, instance management).

### The 4 Distinct Certificate Authorities:
1. **Server CA (`spec.certificates.serverCASecret`)**: Signs server certificates for PostgreSQL pods.
2. **Client CA (`spec.certificates.clientCASecret`)**: Signs client certificates for users and applications authenticating via mTLS.
3. **Replication CA**: Secures streaming replication between primary and standby pods.
4. **Webhook CA**: Secures admission webhook endpoints on port 9443.

### Custom SANs (Subject Alternative Names)
Add custom DNS hostnames or IP addresses to PostgreSQL server certificates (e.g. for external load balancers):
```yaml
spec:
  certificates:
    serverAltNames:
      - "postgres.internal.mycompany.com"
      - "10.0.50.25"
```

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

## 4. Container & Pod Security Hardening
- **Compliant with PSS `restricted`**:
  - **Non-root Execution**: PostgreSQL runs under UID `26` and GID `26` (`spec.postgresUID` and `spec.postgresGID`).
  - **Read-Only Root Filesystem**: `readOnlyRootFilesystem: true`; only ephemeral and PVC storage paths are writable.
  - **Seccomp & Capabilities**: All Linux capabilities are dropped (`capabilities.drop: ["ALL"]`) with `RuntimeDefault` seccomp profile.
  - **No Privilege Escalation**: `allowPrivilegeEscalation: false`.
