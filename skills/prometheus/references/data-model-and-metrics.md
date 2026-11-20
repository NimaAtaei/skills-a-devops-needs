# Data Model & Metric Types

## Time Series Data Model

Every time series in Prometheus is uniquely identified by its **metric name** and a set of
**key-value labels**:

```
<metric_name>{<label_name>="<label_value>", ...}
```

Example:

```
http_requests_total{method="POST", handler="/api/comments", status="200"}
```

### Metric Name

- Indicates the general feature being measured
- Classic regex: `[a-zA-Z_:][a-zA-Z0-9_:]*`
- With UTF-8 enabled (`--enable-feature=utf8-names`): unrestricted UTF-8 when quoted
- Internally stored as the special label `__name__`
- Colons (`:`) are reserved for recording rule names by convention

### Labels

- Key-value pairs providing dimensionality
- Classic regex: `[a-zA-Z_][a-zA-Z0-9_]*`
- Labels starting with double underscore `__` are reserved for internal use:
  - `__address__`: Target host:port (before relabeling, becomes `instance`)
  - `__scheme__`: Target scrape scheme (http/https)
  - `__metrics_path__`: Target metrics path (default `/metrics`)
  - `__param_<name>`: URL query parameter values
  - `__scrape_interval__`: Target-level scrape interval
  - `__scrape_timeout__`: Target-level scrape timeout
- Labels are the primary mechanism for multi-dimensional data slicing

### Samples

A sample consists of:

- **Value**: float64 number (or a native histogram in modern Prometheus)
- **Timestamp**: Millisecond-precision integer (Unix epoch)
- Typical storage cost: ~1–2 bytes per sample (Gorilla-based double-delta timestamp +
  XOR float compression)

## Metric Types

### 1. Counter

A **monotonically increasing** cumulative metric that only goes up or resets to zero on
process restart.

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="POST", code="200"} 1027
http_requests_total{method="POST", code="400"} 3
```

**Rules**:

- Never use a counter for values that can decrease
- Always use `rate()`, `irate()`, or `increase()` to query counters — never raw values
- Counter resets (process restarts) are automatically handled by rate functions
- Related functions: `rate()`, `irate()`, `increase()`, `resets()`

**Common examples**: `http_requests_total`, `process_cpu_seconds_total`,
`node_network_receive_bytes_total`

### 2. Gauge

A metric that can **arbitrarily go up and down**.

```
# HELP node_memory_MemAvailable_bytes Available memory in bytes
# TYPE node_memory_MemAvailable_bytes gauge
node_memory_MemAvailable_bytes 7.43243776e+09
```

**Rules**:

- Use directly for current-state values (temperature, memory usage, queue depth)
- Related functions: `delta()`, `idelta()`, `deriv()`, `predict_linear()`
- Suitable for `min_over_time()`, `max_over_time()`, `avg_over_time()`

**Common examples**: `node_memory_MemAvailable_bytes`, `temperature_celsius`,
`go_goroutines`

### 3. Histogram (Classic)

Samples observations (typically durations or sizes) and counts them in configurable
**bucket intervals**.

```
# HELP http_request_duration_seconds Request duration histogram
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005"} 24054
http_request_duration_seconds_bucket{le="0.01"}  33444
http_request_duration_seconds_bucket{le="0.025"} 100392
http_request_duration_seconds_bucket{le="0.05"}  129389
http_request_duration_seconds_bucket{le="0.1"}   133988
http_request_duration_seconds_bucket{le="0.25"}  144320
http_request_duration_seconds_bucket{le="0.5"}   144320
http_request_duration_seconds_bucket{le="1"}     144320
http_request_duration_seconds_bucket{le="2.5"}   144320
http_request_duration_seconds_bucket{le="5"}     144320
http_request_duration_seconds_bucket{le="10"}    144320
http_request_duration_seconds_bucket{le="+Inf"}  144320
http_request_duration_seconds_sum   53423.21
http_request_duration_seconds_count 144320
```

**Exposed sub-series**:

| Series | Description |
|--------|-------------|
| `<basename>_bucket{le="<bound>"}` | Cumulative count of observations ≤ upper bound |
| `<basename>_sum` | Total sum of all observed values |
| `<basename>_count` | Total number of observations (= `_bucket{le="+Inf"}`) |

**Key properties**:

- Buckets are **cumulative** (each includes all observations from lower buckets)
- **Aggregatable** across instances: `histogram_quantile(0.95, sum(rate(h_bucket[5m])) by (le))`
- Bucket boundaries must be chosen carefully — too few lose resolution, too many waste cardinality
- Default Go client buckets: `.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10`

### 4. Native Histogram

Modern Prometheus feature solving the bucket boundary problem:

- **Dynamic exponential buckets**: Boundaries grow by `factor = 2^(2^(-scale))`
- **Sparse representation**: Empty buckets cost zero bytes
- **High dynamic range**: No predefined bucket configuration needed
- Contains: count, sum, zero-bucket threshold, positive buckets, negative buckets
- Enable via `--enable-feature=native-histograms`
- Remote write support: `send_native_histograms: true`
- **Almost always better than classic histograms** (Zen of Prometheus)

### 5. Summary

Samples observations and calculates **configurable φ-quantiles** directly on the client.

```
# HELP rpc_duration_seconds RPC duration summary
# TYPE rpc_duration_seconds summary
rpc_duration_seconds{quantile="0.5"}  4.773e-05
rpc_duration_seconds{quantile="0.9"}  7.252e-05
rpc_duration_seconds{quantile="0.99"} 7.629e-05
rpc_duration_seconds_sum   1.7560473e+07
rpc_duration_seconds_count 2.693002e+06
```

**Exposed sub-series**:

| Series | Description |
|--------|-------------|
| `<basename>{quantile="<φ>"}` | Streaming φ-quantile (e.g., 0.5 = median) |
| `<basename>_sum` | Total sum of all observed values |
| `<basename>_count` | Total number of observations |

**Critical limitation**: Quantiles from summaries **cannot be aggregated** across instances.
Percentiles cannot be mathematically averaged. Use histograms when aggregation is needed.

### Histogram vs Summary Decision Matrix

| Criterion | Histogram | Summary |
|-----------|-----------|---------|
| Aggregation across instances | ✅ Yes | ❌ No |
| Pre-defined quantiles needed | ❌ No (compute at query time) | ✅ Yes (fixed at instrumentation) |
| Accurate quantile calculation | Depends on bucket granularity | ✅ Highly accurate |
| CPU cost on target | Low (just increment buckets) | Higher (streaming quantile calculation) |
| Cardinality | Proportional to bucket count | Proportional to quantile count |
| Recommended | ✅ Default choice, especially Native Histograms | Only when you need exact quantiles per-instance |

## Jobs and Instances

### Definitions

- **Instance**: A single scrape target endpoint — typically one process at `host:port`
- **Job**: A collection of instances sharing the same purpose (e.g., `job: api-server`)

### Automatically Injected Labels

Every scraped target receives these labels:

| Label | Source |
|-------|--------|
| `job` | Configured `job_name` from `scrape_configs` |
| `instance` | Scraped target `<host>:<port>` (derived from `__address__` after relabeling) |

### Auto-Generated Per-Scrape Metrics

| Metric | Description |
|--------|-------------|
| `up` | `1` if scrape succeeded, `0` if scrape failed |
| `scrape_duration_seconds` | Duration of the HTTP scrape call in seconds |
| `scrape_samples_scraped` | Total number of samples exposed by the target |
| `scrape_samples_post_metric_relabeling` | Samples remaining after metric relabeling |
| `scrape_series_added` | Approximate number of new series discovered |

### Extra Scrape Metrics (requires `--enable-feature=extra-scrape-metrics`)

| Metric | Description |
|--------|-------------|
| `scrape_timeout_seconds` | Configured scrape timeout for this target |
| `scrape_sample_limit` | Configured sample limit (`0` = unlimited) |
| `scrape_body_size_bytes` | Uncompressed scrape payload size (`-1` if exceeded `body_size_limit`) |
