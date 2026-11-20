# PgBouncer Connection Pooling (`Pooler` CRD)

PostgreSQL uses a process-per-connection architecture. When applications open hundreds or thousands of concurrent connections, memory overhead and context switching degrade database throughput. CloudNativePG addresses this through the native `Pooler` custom resource, running PgBouncer instances managed by the operator.

---

## 1. The `Pooler` Custom Resource

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Pooler
metadata:
  name: cluster-prod-pooler
spec:
  cluster:
    name: cluster-prod
  instances: 3 # High availability: run multiple PgBouncer pods
  type: rw     # rw (Primary) | ro (Standbys)

  pgbouncer:
    poolMode: transaction # transaction | session | statement
    parameters:
      max_client_conn: "5000"
      default_pool_size: "50"
      min_pool_size: "10"
      reserve_pool_size: "5"
      max_db_connections: "100"
      # In CNPG 1.30, auth_user can be overridden if needed:
      # auth_user: "pgbouncer_auth_user"

  resources:
    requests:
      cpu: "250m"
      memory: "256Mi"
    limits:
      cpu: "1000m"
      memory: "512Mi"
```

---

## 2. Pool Modes Explained

- **`transaction` (Recommended for Microservices)**:
  - Connections from PgBouncer to PostgreSQL are returned to the pool as soon as each transaction completes.
  - Allows thousands of microservice clients to share 20-50 physical PostgreSQL connections.
  - *Caution*: Does not support session-level features like `SET` commands, temporary tables, or prepared statements (unless using client-side unnamed prepared statements).
- **`session` (Default in raw PgBouncer)**:
  - The client keeps a dedicated Postgres connection until the client explicitly disconnects.
  - Safest for legacy applications relying heavily on session state.
- **`statement`**:
  - Connection is released after every single statement. Multi-statement transactions are rejected. Rarely used.

---

## 3. High Availability & Service Discovery

When a `Pooler` is created, the operator provisions:
1. A Kubernetes `Deployment` running the configured number of PgBouncer replica pods.
2. A dedicated Kubernetes `Service` named after the pooler (e.g., `cluster-prod-pooler`).

Applications connect to the PgBouncer service instead of the database cluster service:
```text
Host: cluster-prod-pooler.default.svc.cluster.local
Port: 5432
```

---

## 4. CEL Immutability (v1.30)
In CloudNativePG 1.30, the `.spec.cluster.name` field in the `Pooler` resource cannot be modified after creation. If you need to redirect pooling to a different cluster, create a new `Pooler` resource or delete and re-create it.
