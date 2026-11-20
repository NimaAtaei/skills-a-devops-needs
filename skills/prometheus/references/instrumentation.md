# Instrumentation & Exposition

## Client Libraries

### Official Libraries

| Language | Package | Registry |
|----------|---------|----------|
| **Go** | `prometheus/client_golang` | Default + process + Go runtime collectors |
| **Java** | `prometheus/client_java` | Default + JVM (heap, GC, threads) collectors |
| **Python** | `prometheus/client_python` | Default + process + GC collectors |
| **Ruby** | `prometheus/client_ruby` | Default + process collectors |

### Library Architecture

1. **Metric Registry**: Central store of all registered metrics
   - Default registry: Automatically registered, used by the standard HTTP handler
   - Custom registries: Isolate metrics for testing or multi-tenant exposition
2. **Metric Types**: Counter, Gauge, Histogram, Summary (see Data Model reference)
3. **Collectors**: Objects that produce metrics on demand during scrape
   - Standard collectors auto-registered: process metrics, language runtime metrics
   - Custom collectors implement a `Collect()` method
4. **HTTP Handler**: Serves `/metrics` endpoint in the negotiated exposition format
5. **Thread Safety**: All metric operations and scrape handling must be concurrency-safe

### Go Client Example

```go
package main

import (
    "net/http"
    "github.com/prometheus/client_golang/prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
    httpRequestsTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total number of HTTP requests",
        },
        []string{"method", "handler", "code"},
    )

    httpRequestDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "http_request_duration_seconds",
            Help:    "HTTP request duration in seconds",
            Buckets: prometheus.DefBuckets, // .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10
        },
        []string{"method", "handler"},
    )

    inFlightRequests = prometheus.NewGauge(
        prometheus.GaugeOpts{
            Name: "http_in_flight_requests",
            Help: "Number of HTTP requests currently being processed",
        },
    )
)

func init() {
    prometheus.MustRegister(httpRequestsTotal)
    prometheus.MustRegister(httpRequestDuration)
    prometheus.MustRegister(inFlightRequests)
}

func main() {
    http.Handle("/metrics", promhttp.Handler())
    http.ListenAndServe(":8080", nil)
}
```

### Auto-Registered Process Metrics

| Metric | Description |
|--------|-------------|
| `process_cpu_seconds_total` | Total user and system CPU time |
| `process_resident_memory_bytes` | Resident memory size |
| `process_virtual_memory_bytes` | Virtual memory size |
| `process_virtual_memory_max_bytes` | Maximum virtual memory available |
| `process_open_fds` | Number of open file descriptors |
| `process_max_fds` | Maximum file descriptors allowed |
| `process_start_time_seconds` | Start time (Unix epoch) |

### Go Runtime Metrics

| Metric | Description |
|--------|-------------|
| `go_goroutines` | Number of active goroutines |
| `go_gc_duration_seconds` | GC pause duration summary |
| `go_memstats_alloc_bytes` | Bytes allocated and in use |
| `go_memstats_heap_alloc_bytes` | Heap bytes allocated and in use |
| `go_threads` | Number of OS threads |
| `go_info{version="..."}` | Go version info gauge (always 1) |

---

## Exposition Formats

### Prometheus Text Format (v0.0.4 & v1.0.0)

Content-Type: `text/plain; version=0.0.4; charset=utf-8`

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST",code="200"} 1027 1395066363000
http_requests_total{method="POST",code="400"} 3 1395066363000

# HELP http_request_duration_seconds Request duration histogram
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.05"} 24054
http_request_duration_seconds_bucket{le="0.1"} 33444
http_request_duration_seconds_bucket{le="0.25"} 100392
http_request_duration_seconds_bucket{le="+Inf"} 144320
http_request_duration_seconds_sum 53423.21
http_request_duration_seconds_count 144320
```

**Rules**:
- Lines starting with `#` are comments, `# HELP`, or `# TYPE`
- Blank lines are ignored
- Timestamps are optional (Unix epoch milliseconds)
- v1.0.0 adds UTF-8 metric and label name support (quoted identifiers)

### OpenMetrics Text Format (v1.0.0)

Content-Type: `application/openmetrics-text; version=1.0.0; charset=utf-8`

```
# HELP http_requests_total Total number of HTTP requests.
# TYPE http_requests_total counter
# UNIT http_requests_total requests
http_requests_total{method="POST",code="200"} 1027.0 1395066363.0
# HELP process_info Process metadata.
# TYPE process_info info
process_info{version="1.2.3"} 1
# EOF
```

**Differences from Prometheus text format**:
- **Mandatory `# EOF`** line — indicates complete, uncorrupted transmission
- **Timestamps in float seconds** (not milliseconds)
- **`# UNIT` annotation** — declares the unit of the metric
- **Additional types**: `info`, `stateset`, `gaugehistogram`, `unknown`
- Counter values must include `.0` (float notation)
- `_total` suffix required for counter metric names
- `_created` timestamp metric for counters and summaries

### Protobuf Format

Content-Type: `application/vnd.google.protobuf; proto=io.prometheus.client.MetricFamily; encoding=delimited`

- Binary serialization using protocol buffer schema
- Most efficient wire format for large metric payloads
- Required for native histogram exposition

### Content Negotiation

Prometheus sends `Accept` header with weighted `q` values based on `scrape_protocols`:

```
Accept: application/vnd.google.protobuf;proto=io.prometheus.client.MetricFamily;encoding=delimited;q=0.9,
        application/openmetrics-text;version=1.0.0;q=0.8,
        text/plain;version=0.0.4;q=0.7
```

Target responds with the highest-weighted format it supports.

**Fallback protocol**: If no `Accept` header or unknown format, `fallback_scrape_protocol`
applies (default: `PrometheusText0.0.4`).

### UTF-8 Escaping Schemes

When metric or label names contain non-standard characters (UTF-8 mode):

| Scheme | Example | Description |
|--------|---------|-------------|
| `NoEscaping` | `my.metric.name` | No escaping (requires parser support) |
| `UnderscoreEscaping` | `my_metric_name` | Replace non-alphanumeric with `_` |
| `DotsEscaping` | `U__my_2e_metric_2e_name` | Hex-encode special chars with `_XX_` prefix |
| `AllowUTF8` | `"my.metric.name"` | Quote the identifier (OpenMetrics 1.0+) |

---

## Pushgateway

### Purpose

Intermediary service for jobs that cannot be scraped (short-lived batch jobs, cron tasks,
serverless functions):

```
Batch Job ──push──▶ Pushgateway ◀──scrape── Prometheus
```

### Push API

```bash
# Push metrics for job "batch_import" with instance label
cat <<EOF | curl --data-binary @- \
  http://pushgateway:9091/metrics/job/batch_import/instance/worker-1

# HELP batch_duration_seconds Duration of the batch job
# TYPE batch_duration_seconds gauge
batch_duration_seconds 523.4
# HELP batch_records_processed_total Records processed
# TYPE batch_records_processed_total counter
batch_records_processed_total 142857
EOF
```

**URL path encoding**: `/metrics/job/<JOB>/[<LABEL_NAME>/<LABEL_VALUE>/...]`

**HTTP Methods**:

| Method | Behavior |
|--------|----------|
| `POST` | Updates only the metrics in the body (others from same group remain) |
| `PUT` | Replaces ALL metrics for the group (deletes metrics not in body) |
| `DELETE` | Deletes ALL metrics for the specified group |

### Pushgateway Caveats

> **Warning**: The Pushgateway should NOT be used as a general-purpose push mechanism.

| Concern | Detail |
|---------|--------|
| Single point of failure | All pushed metrics lost if Pushgateway crashes without persistence |
| Stale metrics | Pushed metrics persist **indefinitely** until explicitly deleted |
| `up` metric | Reflects Pushgateway health, NOT the original job's health |
| No instance monitoring | Cannot detect when a push source goes down |

**When to use**: Only for truly ephemeral batch/cron jobs where the job lifetime is shorter
than the scrape interval and the job cannot expose a scrape endpoint.

---

## Writing Exporters

### Design Principles

1. **Scrape on demand**: Fetch metrics from the third-party system during Prometheus scrape,
   not via background polling — ensures freshness and proper timeout propagation
2. **Metric naming**: Prefix with the exporter/system name (e.g., `mysql_`, `haproxy_`)
3. **Labels over metric names**: Use labels for dimensions, never encode dimensions in names
4. **Standard metrics**: Always expose `<exporter>_up` (1/0) and `<exporter>_scrape_duration_seconds`

### Multi-Target Exporter Pattern

A single exporter instance can query arbitrary endpoints via URL parameters:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: blackbox
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://prometheus.io
          - https://grafana.com
    relabel_configs:
      # Pass target URL as the `target` parameter
      - source_labels: [__address__]
        target_label: __param_target
      # Store target URL as the `instance` label
      - source_labels: [__param_target]
        target_label: instance
      # Set the actual scrape address to the exporter
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

### Common Exporters

| Exporter | Default Port | Metrics Source |
|----------|-------------|----------------|
| Node Exporter | 9100 | Linux host (CPU, memory, disk, network, filesystem) |
| Blackbox Exporter | 9115 | HTTP/HTTPS/DNS/TCP/ICMP probes |
| MySQL Exporter | 9104 | MySQL/MariaDB server status |
| PostgreSQL Exporter | 9187 | PostgreSQL statistics |
| Redis Exporter | 9121 | Redis INFO and command stats |
| SNMP Exporter | 9116 | SNMP OID polling |
| HAProxy Exporter | 9101 | HAProxy statistics |
| cAdvisor | 8080 | Container resource metrics |
| kube-state-metrics | 8080/8081 | Kubernetes object state |
