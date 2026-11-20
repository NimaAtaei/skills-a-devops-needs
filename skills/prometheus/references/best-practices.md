# Prometheus Best Practices

## Metric & Label Naming Conventions

### Metric Name Rules

| Rule | Good | Bad |
|------|------|-----|
| Use `snake_case` | `http_requests_total` | `HttpRequestsTotal` |
| Prefix with application/domain name | `myapp_http_requests_total` | `requests_total` |
| Use base units (seconds, bytes, ratios) | `request_duration_seconds` | `request_duration_milliseconds` |
| Suffix with unit | `disk_usage_bytes` | `disk_usage` |
| Suffix counters with `_total` | `http_requests_total` | `http_requests` |
| Suffix durations with `_seconds` | `request_latency_seconds` | `request_latency_ms` |
| Suffix sizes with `_bytes` | `response_size_bytes` | `response_size_mb` |
| Suffix ratios with `_ratio` | `cache_hit_ratio` | `cache_hit_percent` |
| Suffix info metrics with `_info` | `build_info{version="1.2.3"}` | `build_version` |
| Match regex `[a-zA-Z_:][a-zA-Z0-9_:]*` | `http_requests_total` | `2xx-requests` |
| Reserve `:` for recording rules | `job:http_requests:rate5m` | `http:requests:total` |

### Standard Suffixes

| Suffix | Type | Unit | Example |
|--------|------|------|---------|
| `_total` | Counter | — | `http_requests_total` |
| `_seconds` | Gauge/Histogram/Summary | Seconds (always!) | `request_duration_seconds` |
| `_bytes` | Gauge/Counter | Bytes (always!) | `memory_usage_bytes` |
| `_ratio` | Gauge | 0.0–1.0 fraction | `cache_hit_ratio` |
| `_info` | Gauge | Always 1 | `build_info{version="1.2.3"}` |
| `_created` | Gauge | Unix epoch seconds | Counter/summary creation timestamp |
| `_bucket` | Counter | — | Histogram bucket (auto-generated) |
| `_sum` | Counter | — | Histogram/summary sum (auto-generated) |
| `_count` | Counter | — | Histogram/summary count (auto-generated) |

### Label Rules

| Rule | Good | Bad |
|------|------|-----|
| Use labels for dimensions | `requests{method="POST"}` | `post_requests` |
| Keep cardinality bounded | `{status="2xx"}` | `{user_id="uuid-..."}` |
| Don't encode dimensions in metric name | `requests{method="GET"}` | `get_requests` |
| Use meaningful, short label names | `method`, `handler`, `code` | `http_method_name` |

### Cardinality Control

> **Critical**: Labels are multiplicative. Each unique combination of label values creates
> a new time series. Unbounded label dimensions destroy TSDB performance.

**Dangerous label values** (never use as labels):

- User IDs, usernames, email addresses
- IP addresses (use aggregated subnets or drop)
- UUIDs, session IDs, trace IDs
- Full URLs or paths (use route patterns instead)
- Timestamps or dates
- Error messages (use error codes)

**Cardinality estimation**:

```
total_series = Σ (cardinality(label_1) × cardinality(label_2) × ... × cardinality(label_n))
```

**Rule of thumb**: Keep total active time series under ~10 million per Prometheus server.
Monitor with `prometheus_tsdb_head_series`.

---

## Histograms vs Summaries

### Use Histogram When:

- You need to **aggregate percentiles across multiple instances** (pods, replicas)
- You can define reasonable bucket boundaries (or use native histograms)
- You need `histogram_quantile()` for SLO calculations
- You want server-side quantile computation (adjustable after instrumentation)

### Use Summary When:

- You need **highly accurate quantiles per-instance** without predefined buckets
- You **never** need to aggregate across instances (mathematical impossibility)
- You have a fixed, known set of quantile values needed at instrumentation time

### Key Differences

| Aspect | Histogram | Summary |
|--------|-----------|---------|
| Quantile computation | Server-side (PromQL) | Client-side |
| Cross-instance aggregation | ✅ Supported | ❌ Not possible |
| Bucket/quantile configuration | At instrumentation time | At instrumentation time |
| Quantile accuracy | Depends on bucket granularity | Highly accurate (streaming algorithm) |
| CPU cost on target | Low (counter increments) | Higher (quantile calculation) |
| Flexible quantiles at query time | ✅ Any φ via `histogram_quantile()` | ❌ Fixed at instrumentation |
| **Recommendation** | ✅ **Default choice** | Only for per-instance exact quantiles |

---

## Alerting Best Practices

### Philosophy

1. **Alert on symptoms, not causes**: Users care about latency, error rates, and
   availability — not CPU utilization or goroutine counts
2. **Keep pages for urgent, actionable emergencies**: Only page humans when immediate
   action is required right now
3. **Warnings go to dashboards or ticket queues**: Non-urgent issues belong in
   dashboards, Slack channels, or automated ticket creation
4. **Avoid alert fatigue**: Too many false positives or unactionable alerts train humans
   to ignore all alerts

### Alert Rule Guidelines

| Practice | Implementation |
|----------|---------------|
| Always use `for:` duration | `for: 5m` minimum to absorb transient scrape blips |
| Use multi-window, multi-burn-rate | SLO-based alerting with fast (1h) and slow (3d) windows |
| Include `runbook_url` annotation | Link to actionable investigation steps |
| Include `dashboard_url` annotation | Link to relevant Grafana dashboard |
| Severity labels for routing | `severity: critical\|warning\|info` |
| Team labels for routing | `team: backend\|frontend\|platform` |
| Use `keep_firing_for` for flappy alerts | Grace period prevents rapid fire/resolve cycles |

### SLO-Based Alerting Pattern (Multi-Burn-Rate)

```yaml
# 99.9% availability SLO (43.8 minutes/month error budget)
groups:
  - name: slo-alerts
    rules:
      # Fast burn: 14.4x error budget consumption rate over 1h
      - alert: HighErrorBudgetBurn
        expr: |
          (
            sum(rate(http_requests_total{code=~"5.."}[1h]))
            / sum(rate(http_requests_total[1h]))
          ) > (14.4 * 0.001)
          and
          (
            sum(rate(http_requests_total{code=~"5.."}[5m]))
            / sum(rate(http_requests_total[5m]))
          ) > (14.4 * 0.001)
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error budget burn rate"

      # Slow burn: 1x error budget consumption rate over 3d
      - alert: ErrorBudgetNearlyExhausted
        expr: |
          (
            sum(rate(http_requests_total{code=~"5.."}[3d]))
            / sum(rate(http_requests_total[3d]))
          ) > (1 * 0.001)
          and
          (
            sum(rate(http_requests_total{code=~"5.."}[6h]))
            / sum(rate(http_requests_total[6h]))
          ) > (1 * 0.001)
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Error budget nearly exhausted"
```

### Dead-Man's Switch (Watchdog)

```yaml
- alert: Watchdog
  expr: vector(1)
  labels:
    severity: none
  annotations:
    summary: "Watchdog alert - confirms alerting pipeline is functional"
```

Configure a receiver that alerts when this alert STOPS firing (e.g., Dead Man's Snitch,
PagerDuty low-urgency service).

---

## Recording Rule Best Practices

### Naming Convention

```
level:metric:operations
```

| Component | Description | Examples |
|-----------|-------------|---------|
| `level` | Aggregation level (labels preserved) | `job`, `instance`, `cluster`, `namespace` |
| `metric` | Original metric name (without `_total`) | `http_requests`, `request_duration_seconds` |
| `operations` | Applied operations in order | `rate5m`, `sum`, `count`, `mean5m` |

### Examples

```yaml
groups:
  - name: http-recording-rules
    interval: 30s
    rules:
      # Rate of requests per job over 5 minutes
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))

      # Error ratio per job
      - record: job:http_requests:error_ratio_rate5m
        expr: |
          sum by (job) (rate(http_requests_total{code=~"5.."}[5m]))
          /
          sum by (job) (rate(http_requests_total[5m]))

      # P99 latency per job
      - record: job:http_request_duration_seconds:p99_rate5m
        expr: |
          histogram_quantile(0.99,
            sum by (job, le) (rate(http_request_duration_seconds_bucket[5m]))
          )
```

### When to Use Recording Rules

| Use Recording Rules | Don't Use Recording Rules |
|---------------------|--------------------------|
| Dashboard queries executed frequently | One-off ad-hoc queries |
| Alert rule expressions used in multiple alerts | Simple metric selectors |
| Expensive aggregations over high-cardinality metrics | Low-cardinality metrics |
| Cross-job or cross-namespace aggregations | Per-instance queries |
| When query latency impacts dashboard load times | When TSDB easily handles the query |

---

## The Zen of Prometheus

1. **Instrument first, ask questions later**: Instrumentation is cheap; uninstrumented
   code is blind
2. **Measure what users care about**: SLOs and user experience guide alerts
3. **Labels are the new hierarchies**: Multi-dimensional slicing replaces dot-separated
   metric hierarchies
4. **Avoid missing metrics**: Initialize counters to 0 so they appear before first
   increment (`_total` = 0 is valid and queryable)
5. **Cardinality matters**: Labels are multiplicative; unbounded cardinality breaks TSDB
6. **Naming is hard**: Follow the naming conventions strictly and consistently
7. **Counters rule, gauges suck**: Expose raw monotonically increasing counters; let
   PromQL compute rates. Counters survive scrape gaps; gauges lose intermediate values
8. **First the rate, then aggregate**: Always `sum(rate(counter[5m]))`, NEVER
   `rate(sum(counter)[5m])` — summing counters destroys counter reset detection!
9. **If you can log it, you can have a metric for it**: Count events by coarse category
   rather than logging each individual event
10. **Native histograms are almost always better than classic histograms**: Avoid
    manual bucket tuning; let exponential buckets handle dynamic range
11. **If you can graph it, you can alert on it**: PromQL powers both dashboards and
    alerts identically
12. **If you run it, you should put an alert on it**: At minimum, monitor `up == 0`
    for every scrape target
13. **Alerts should be urgent, important, actionable, and real**: Avoid alert fatigue
    by eliminating noisy, unactionable notifications
14. **Symptom-based alerts for paging, cause-based for troubleshooting**: Page on
    "users are seeing errors"; dashboard "CPU is high" for root cause analysis
15. **Please five more minutes**: Use `for: 5m` tolerance to absorb transient blips

---

## Pushgateway Best Practices

### When to Use

- Truly ephemeral batch/cron jobs shorter than the scrape interval
- Jobs that cannot expose a scrape endpoint (e.g., short-lived Kubernetes Jobs)

### When NOT to Use

- Long-running services (use direct scraping)
- Multiple instances of the same job (pushed metrics clobber each other)
- As a general-purpose metric push aggregator

### Rules

1. Push only one set of metrics per job/instance combination
2. Always delete metrics after the batch job completes or fails
3. Never use Pushgateway as a caching layer for metrics
4. Monitor the Pushgateway itself with standard scraping

---

## Remote Write Tuning

### Monitoring Remote Write Health

```promql
# Samples waiting in queue (should not grow continuously)
prometheus_remote_storage_samples_pending

# Failed sample sends (should be near zero)
rate(prometheus_remote_storage_samples_failed_total[5m])

# Successful sends
rate(prometheus_remote_storage_succeeded_samples_total[5m])

# Current active shards
prometheus_remote_storage_shards

# Shard capacity utilization
prometheus_remote_storage_shard_capacity

# Bytes sent per second
rate(prometheus_remote_storage_bytes_total[5m])
```

### Tuning Guidelines

| Symptom | Action |
|---------|--------|
| `samples_pending` growing | Increase `max_shards` or `max_samples_per_send` |
| High latency to remote endpoint | Increase `max_shards` to parallelize |
| Remote endpoint returning 429 | Respect backoff; consider reducing `max_shards` |
| High memory usage | Reduce `capacity` per shard |
| Data loss concerns | Ensure WAL is on persistent storage |
