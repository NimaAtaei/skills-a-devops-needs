# Operations & Security

## Security Model

Prometheus assumes deployment within a **trusted internal network**. By default:

- All HTTP endpoints are unauthenticated
- Metrics data, alert state, and configuration are exposed to any client
- If admin API is enabled, TSDB deletion and server shutdown are possible unauthenticated

### Mitigation: TLS, mTLS & Basic Auth

Configure via `--web.config.file=web-config.yml`:

```yaml
# TLS server configuration
tls_server_config:
  cert_file: /etc/prometheus/server.crt
  key_file: /etc/prometheus/server.key

  # Minimum TLS version (default: TLS12)
  min_version: TLS12

  # Maximum TLS version
  max_version: TLS13

  # Allowed cipher suites (empty = Go defaults)
  cipher_suites: []

  # Curve preferences for ECDHE
  curve_preferences: []

  # Client certificate authentication
  # NoClientCert | RequestClientCert | RequireAnyClientCert |
  # VerifyClientCertIfGiven | RequireAndVerifyClientCert
  client_auth_type: RequireAndVerifyClientCert
  client_ca_file: /etc/prometheus/ca.crt

# HTTP server configuration
http_server_config:
  http2: true
  headers:
    Content-Security-Policy: "default-src 'self'"
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff
    Strict-Transport-Security: "max-age=31536000; includeSubDomains"

# Basic authentication users (bcrypt hashed passwords)
basic_auth_users:
  admin: "$2y$12$LJ0yVWq3PYy3Gk..."
  readonly: "$2y$12$abc123..."
```

Generate bcrypt password hash:

```bash
# Using htpasswd
htpasswd -nBC 12 "" | tr -d ':\n'

# Using promtool
promtool bcrypt-hash <password>
```

Validate configuration:

```bash
promtool check web-config web-config.yml
```

---

## Command-Line Flags

### `prometheus` Binary

| Flag | Default | Description |
|------|---------|-------------|
| `--config.file` | `prometheus.yml` | Configuration file path |
| `--web.listen-address` | `:9090` | Address to listen on |
| `--web.config.file` | — | TLS/auth configuration file |
| `--web.enable-lifecycle` | `false` | Enable `/-/reload` and `/-/quit` endpoints |
| `--web.enable-admin-api` | `false` | Enable TSDB admin endpoints |
| `--web.enable-remote-write-receiver` | `false` | Enable remote write receiver endpoint |
| `--web.external-url` | — | External URL for link generation |
| `--web.route-prefix` | — | Prefix for HTTP routes (default: path of `--web.external-url`) |
| `--web.console.templates` | `consoles` | Path to console template directory |
| `--web.console.libraries` | `console_libraries` | Path to console library directory |
| `--web.page-title` | `Prometheus Time Series Collection and Processing Server` | Document title |
| `--storage.tsdb.path` | `data/` | TSDB data directory |
| `--storage.tsdb.retention.time` | `15d` | Data retention period |
| `--storage.tsdb.retention.size` | `0` (unlimited) | Maximum disk size for blocks |
| `--storage.tsdb.no-lockfile` | `false` | Don't create lockfile in data directory |
| `--storage.tsdb.wal-compression` | `true` | Compress WAL with snappy |
| `--storage.tsdb.head-chunks-write-queue-size` | `0` | Size of chunk write queue (0 = disabled) |
| `--rules.alert.for-outage-tolerance` | `1h` | Maximum time for restored alert `for` state |
| `--rules.alert.for-grace-period` | `10m` | Minimum `for` state duration before alerting |
| `--rules.alert.resend-delay` | `1m` | Minimum wait before resending alert to Alertmanager |
| `--alertmanager.notification-queue-capacity` | `10000` | Alert notification queue capacity |
| `--query.max-concurrency` | `20` | Maximum concurrent queries |
| `--query.max-samples` | `50000000` | Maximum samples a single query can load |
| `--query.timeout` | `2m` | Maximum query execution time |
| `--query.lookback-delta` | `5m` | Maximum lookback for instant queries |
| `--log.level` | `info` | Log level: debug, info, warn, error |
| `--log.format` | `logfmt` | Log format: logfmt, json |

### Feature Flags (`--enable-feature=`)

Comma-separated list of experimental features:

| Feature Flag | Description |
|-------------|-------------|
| `exemplar-storage` | Enable exemplar storage and querying |
| `memory-snapshot-on-shutdown` | Write head chunk snapshot on graceful shutdown for fast restart |
| `extra-scrape-metrics` | Expose additional per-scrape metrics |
| `per-step-stats` | Per-step query statistics in API responses |
| `utf8-names` | Allow UTF-8 characters in metric and label names |
| `native-histograms` | Enable native histogram ingestion and querying |
| `promql-experimental-functions` | Enable experimental PromQL functions |
| `created-timestamp-zero-ingestion` | Ingest created timestamp from OpenMetrics `_created` |
| `otlp-write-receiver` | Enable OTLP receiver endpoint at `/api/v1/otlp/v1/metrics` |
| `agent` | Run Prometheus in Agent Mode (scrape + remote write only) |
| `auto-gomaxprocs` | Automatically set GOMAXPROCS based on cgroup CPU quota |
| `auto-gomemlimit` | Automatically set GOMEMLIMIT based on cgroup memory limit |

### `alertmanager` Binary

| Flag | Default | Description |
|------|---------|-------------|
| `--config.file` | `alertmanager.yml` | Configuration file path |
| `--web.listen-address` | `:9093` | Address to listen on |
| `--web.external-url` | — | External URL for link generation |
| `--storage.path` | `data/` | Alertmanager data directory |
| `--data.retention` | `120h` | Alert data retention (5 days) |
| `--cluster.listen-address` | `:9094` | Cluster gossip address (empty = disable HA) |
| `--cluster.peer` | — | Peer address(es) for gossip mesh |
| `--cluster.peer-timeout` | `15s` | Peer connection timeout |
| `--cluster.gossip-interval` | `200ms` | Gossip message interval |
| `--cluster.pushpull-interval` | `1m` | Full state sync interval |
| `--log.level` | `info` | Log level |

---

## `promtool` CLI

### Configuration Validation

```bash
# Validate prometheus.yml syntax and referenced rule files
promtool check config prometheus.yml

# Validate rule files syntax
promtool check rules rules/*.yml

# Validate web-config.yml (TLS/auth)
promtool check web-config web-config.yml

# Validate metrics exposition (e.g., from curl output)
curl -s http://localhost:8080/metrics | promtool check metrics
```

### Querying

```bash
# Instant query
promtool query instant http://localhost:9090 'up{job="api"}'

# Range query
promtool query range http://localhost:9090 \
  --start='2024-01-01T00:00:00Z' \
  --end='2024-01-01T01:00:00Z' \
  --step=60s \
  'rate(http_requests_total[5m])'

# Query series metadata
promtool query series http://localhost:9090 \
  --match='http_requests_total'

# Query label values
promtool query labels http://localhost:9090 job
```

### Rule Unit Testing

```bash
# Run unit tests for alerting/recording rules
promtool test rules test/*.yml
```

See [Rule Unit Tests example](../examples/rule-unit-tests.yaml) for test file format.

### TSDB Operations

```bash
# Analyze TSDB block cardinality and statistics
promtool tsdb analyze ./data

# List all blocks in data directory
promtool tsdb list ./data

# Dump raw samples from a block
promtool tsdb dump ./data/01BKGV7JBM69T2G1BGBGM6KB12

# Import OpenMetrics data into TSDB blocks
promtool tsdb create-blocks-from openmetrics input.txt --output-dir=./data

# Backfill recording rule results
promtool tsdb create-blocks-from rules \
  --start=2024-01-01T00:00:00Z \
  --end=2024-01-31T00:00:00Z \
  --url=http://localhost:9090 \
  rules.yml

# Generate bcrypt hash for web-config basic auth
promtool bcrypt-hash <password>
```

---

## Management API

### Health & Readiness

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/-/healthy` | GET | Returns 200 OK when server is initialized |
| `/-/ready` | GET | Returns 200 OK when TSDB and rules are ready |

### Lifecycle (requires `--web.enable-lifecycle`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/-/reload` | POST | Hot-reload configuration and rule files |
| `/-/quit` | POST | Graceful shutdown |

### TSDB Admin (requires `--web.enable-admin-api`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/tsdb/snapshot` | POST | Take TSDB snapshot. Param: `skip_head=true` |
| `/api/v1/admin/tsdb/delete_series` | POST | Delete series. Params: `match[]`, `start`, `end` |
| `/api/v1/admin/tsdb/clean_tombstones` | POST | Purge tombstoned data |

---

## HTTP API Endpoints

### Standard Response Envelope

```json
{
  "status": "success",
  "data": { ... },
  "errorType": "...",
  "error": "...",
  "warnings": ["..."]
}
```

### Query Endpoints

| Endpoint | Method | Parameters | Description |
|----------|--------|------------|-------------|
| `/api/v1/query` | GET/POST | `query`, `time`, `timeout` | Instant query evaluation |
| `/api/v1/query_range` | GET/POST | `query`, `start`, `end`, `step`, `timeout` | Range query |
| `/api/v1/query_exemplars` | GET/POST | `query`, `start`, `end` | Exemplars for expression |

### Metadata Endpoints

| Endpoint | Method | Parameters | Description |
|----------|--------|------------|-------------|
| `/api/v1/series` | GET/POST | `match[]`, `start`, `end` | List matching time series |
| `/api/v1/labels` | GET/POST | `match[]`, `start`, `end` | List all label names |
| `/api/v1/label/<name>/values` | GET | `match[]`, `start`, `end` | Values for a label |
| `/api/v1/metadata` | GET | `metric`, `limit` | Metric HELP/TYPE/UNIT metadata |
| `/api/v1/targets/metadata` | GET | `match_target`, `metric`, `limit` | Per-target metadata |

### Status Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/targets` | GET | Scrape target status (param: `state=active\|dropped\|any`) |
| `/api/v1/alertmanagers` | GET | Active and dropped Alertmanager instances |
| `/api/v1/rules` | GET | Recording and alerting rules with state |
| `/api/v1/alerts` | GET | Active firing/pending alerts |
| `/api/v1/status/config` | GET | Currently loaded YAML configuration |
| `/api/v1/status/flags` | GET | Active command-line flags |
| `/api/v1/status/runtimeinfo` | GET | Goroutines, memory, storage paths |
| `/api/v1/status/buildinfo` | GET | Version, revision, Go version, build date |
| `/api/v1/status/tsdb` | GET | Cardinality stats, head/postings analysis |
| `/api/v1/status/walreplay` | GET | WAL replay progress (during startup) |

### OTLP Receiver (requires `--enable-feature=otlp-write-receiver`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/otlp/v1/metrics` | POST | Receive OpenTelemetry metrics via OTLP |

---

## Visualization

### Expression Browser

- Built-in React interface at `http://localhost:9090/graph`
- **Table tab**: Instant vector point-in-time values
- **Graph tab**: Interactive time-series line graphs with customizable time ranges
- Features: PromQL syntax highlighting, autocomplete, query history, query explain

### Grafana Integration

- Native Prometheus data source plugin
- PromQL query builder and raw editor
- Exemplar links to tracing backends (Tempo, Jaeger)
- Dashboard template variables with label value queries

### Perses

- CNCF open-source, GitOps-native dashboard engine
- Embeddable alternative to Grafana for Prometheus visualization
