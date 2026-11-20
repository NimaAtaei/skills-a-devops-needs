# Monitoring, Metrics & Observability (v1.30)

CloudNativePG exposes comprehensive observability out of the box, including internal PostgreSQL metrics, Kubernetes controller events, and structured audit logs.

---

## 1. Built-in Prometheus Metrics Exporter

Every PostgreSQL pod runs a built-in metrics exporter listening on TCP port `9187` at `/metrics`.

### Key Metrics Exported:
- `cnpg_collector_up`: Whether the instance manager metrics collector is functional.
- `cnpg_last_failed_backup_timestamp`: Timestamp of the last failed backup attempt.
- `cnpg_pg_stat_database_*`: Transactions committed, rolled back, blocks read/hit, deadlocks.
- `cnpg_pg_stat_replication_*`: Replication lag in bytes and time per standby.
- `cnpg_pg_stat_archiver_*`: Archived and failed WAL counts.

### Enabling the Prometheus Operator `PodMonitor`
```yaml
spec:
  monitoring:
    enablePodMonitor: true
    # Optionally override scraping port or interval:
    # podMonitorMetricRelabelings: []
```

---

## 2. User-Defined Custom Metrics

Organizations often need to monitor business data or specific PostgreSQL internals (e.g., table bloat, slow queries, row count trends). CloudNativePG allows injecting custom SQL metric queries via ConfigMaps.

### Step 1: Create the ConfigMap with Custom Queries
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cnpg-custom-metrics
  namespace: database
data:
  custom-queries.yaml: |
    pg_table_row_estimates:
      query: "SELECT schemaname, relname, n_live_tup FROM pg_catalog.pg_stat_user_tables;"
      metrics:
        - schemaname:
            usage: "LABEL"
            description: "Schema name"
        - relname:
            usage: "LABEL"
            description: "Table name"
        - n_live_tup:
            usage: "GAUGE"
            description: "Estimated number of live rows in table"
```

> **Security & Search Path Guardrail**: All custom queries must strictly use schema-qualified table names (e.g. `pg_catalog.pg_stat_user_tables`). The exporter runs under the `cnpg_metrics_exporter` role (which inherits `pg_monitor`), and its PostgreSQL `search_path` is strictly locked down to prevent privilege escalation.

### Step 2: Reference the ConfigMap in the `Cluster` Spec
```yaml
spec:
  monitoring:
    enablePodMonitor: true
    customQueriesConfigMap:
      - name: cnpg-custom-metrics
        key: custom-queries.yaml
```

---

## 3. Database Audit Logging (`pgaudit`)

CloudNativePG supports enterprise audit logging via the `pgaudit` extension:

```yaml
spec:
  postgresql:
    parameters:
      shared_preload_libraries: "pgaudit"
      pgaudit.log: "write, ddl, role"
      pgaudit.log_catalog: "off"
      pgaudit.log_level: "log"
```

When enabled, PostgreSQL writes structured audit log lines for all DDL changes, privilege grants, and data modifications directly to the container's standard output (`stdout`), where Fluentd, Logstash, or Cloud Logging can index them.
