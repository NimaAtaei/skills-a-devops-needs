# PromQL — Prometheus Query Language

## Expression Data Types

| Type | Description |
|------|-------------|
| **Instant vector** | Set of time series each containing a single sample at the same timestamp |
| **Range vector** | Set of time series each containing a range of data points over a time duration |
| **Scalar** | Simple numeric float64 value |
| **String** | Literal string value (limited use) |

## Selectors

### Instant Vector Selector

```promql
http_requests_total{status="200", method=~"GET|POST", env!="staging"}
```

**Label matchers**:

| Operator | Meaning |
|----------|---------|
| `=` | Exact equality |
| `!=` | Inequality |
| `=~` | Regex match (RE2 syntax, fully anchored) |
| `!~` | Negative regex match |

At least one matcher must not match the empty string. `{__name__=~".+"}` selects all
metrics (expensive).

### Range Vector Selector

Appends a duration in brackets to an instant vector selector:

```promql
http_requests_total{job="api"}[5m]
```

**Duration units**: `ms` (milliseconds), `s` (seconds), `m` (minutes), `h` (hours),
`d` (days, 24h), `w` (weeks, 7d), `y` (years, 365d). Combinable: `1h30m`.

### Subquery

Evaluates an instant vector expression over a range at a given resolution:

```promql
<instant_query>[<range>:<resolution>]
```

Example — 95th percentile of 5-minute rate, evaluated every minute over the last 30 minutes:

```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))[30m:1m]
```

If `resolution` is omitted, the global `evaluation_interval` is used.

### Offset Modifier

Shifts the evaluation time window into the past:

```promql
http_requests_total offset 1h
rate(http_requests_total[5m] offset 1d)
```

### @ Modifier

Evaluates the selector at a fixed Unix epoch timestamp:

```promql
http_requests_total @ 1609459200
http_requests_total @ start()   # range query start time
http_requests_total @ end()     # range query end time
```

## Operators

### Arithmetic Binary Operators

`+`, `-`, `*`, `/`, `%` (modulo), `^` (power)

Defined between:

| Left | Right | Result |
|------|-------|--------|
| scalar | scalar | scalar |
| vector | scalar | vector (op applied element-wise) |
| scalar | vector | vector (op applied element-wise) |
| vector | vector | vector (matched by labels, see Vector Matching) |

### Comparison Binary Operators

`==`, `!=`, `>`, `<`, `>=`, `<=`

- **Default behavior** (between vectors): Acts as a **filter** — drops elements that don't match
- **`bool` modifier**: Returns `0` or `1` instead of filtering:
  ```promql
  http_requests_total > bool 100
  ```

### Logical / Set Binary Operators

Defined **only between instant vectors**:

| Operator | Semantics |
|----------|-----------|
| `and` | Intersection — returns elements from left that have a match on right |
| `or` | Union — returns all elements; right fills gaps where left has no match |
| `unless` | Complement — returns elements from left that have NO match on right |

### Vector Matching

Controls how elements from two vectors are paired:

**`on(<labels>)`**: Match only on the specified labels
**`ignoring(<labels>)`**: Match on all labels except those specified

```promql
method_code:http_errors:rate5m{code="500"}
  / ignoring(code)
method:http_requests:rate5m
```

**Many-to-one / one-to-many**:

| Keyword | Direction | Usage |
|---------|-----------|-------|
| `group_left(<labels>)` | Many-to-one | Many elements on left match one on right; optionally copies extra labels from right |
| `group_right(<labels>)` | One-to-many | One element on left matches many on right |

```promql
method_code:http_errors:rate5m
  / ignoring(code) group_left
method:http_requests:rate5m
```

## Aggregation Operators

Syntax forms (both equivalent):

```promql
<aggr_op>([parameter,] <vector>) [without|by (<labels>)]
<aggr_op> [without|by (<labels>)] ([parameter,] <vector>)
```

`by` keeps only listed labels. `without` removes listed labels (keeps all others).

| Operator | Description | Parameter |
|----------|-------------|-----------|
| `sum` | Sum across dimensions | — |
| `min` | Minimum value | — |
| `max` | Maximum value | — |
| `avg` | Arithmetic mean | — |
| `group` | Groups series (value = 1) | — |
| `stddev` | Population standard deviation | — |
| `stdvar` | Population variance | — |
| `count` | Count of elements | — |
| `count_values` | Count of elements with each distinct value | `"label_name"` |
| `bottomk` | Smallest k elements by value | `k` |
| `topk` | Largest k elements by value | `k` |
| `quantile` | φ-quantile across elements | `φ` (0 ≤ φ ≤ 1) |
| `limitk` | Limit to k sample results | `k` |
| `limit_ratio` | Limit to ratio of sample results | `ratio` |

## Functions Reference

### Rate & Counter Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `rate()` | `rate(v range-vector)` | Per-second average rate of increase. Handles counter resets. **Primary function for counters.** |
| `irate()` | `irate(v range-vector)` | Instant rate using last two samples. Good for volatile graphs, **never use for alerting** (misses spikes between samples). |
| `increase()` | `increase(v range-vector)` | Total increase over range window. Equivalent to `rate() * range_seconds`. |
| `resets()` | `resets(v range-vector)` | Number of counter resets detected in range. |

> **Critical rule**: Always `sum(rate(counter[5m]))`, NEVER `rate(sum(counter)[5m])`.
> Summing counters before taking rate destroys counter reset detection.

### Derivative & Trend Functions (Gauges)

| Function | Signature | Description |
|----------|-----------|-------------|
| `delta()` | `delta(v range-vector)` | Difference between first and last value in range. For gauges only. |
| `idelta()` | `idelta(v range-vector)` | Difference between last two samples. For gauges only. |
| `deriv()` | `deriv(v range-vector)` | Per-second derivative via simple linear regression. |
| `predict_linear()` | `predict_linear(v range-vector, t scalar)` | Predicts gauge value `t` seconds in the future using linear regression. |
| `holt_winters()` | `holt_winters(v range-vector, sf scalar, tf scalar)` | Smoothed value using double exponential (Holt-Winters) smoothing. `sf` = smoothing factor (0–1), `tf` = trend factor (0–1). |

### Histogram Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `histogram_quantile()` | `histogram_quantile(φ scalar, b instant-vector)` | Calculates φ-quantile from classic histogram buckets. `b` must have `le` label. |
| `histogram_avg()` | `histogram_avg(v instant-vector)` | Average observation value from native histogram. |
| `histogram_count()` | `histogram_count(v instant-vector)` | Total observation count from native histogram. |
| `histogram_sum()` | `histogram_sum(v instant-vector)` | Total sum of observations from native histogram. |
| `histogram_fraction()` | `histogram_fraction(lower scalar, upper scalar, v instant-vector)` | Fraction of observations between lower and upper bounds. |
| `histogram_stddev()` | `histogram_stddev(v instant-vector)` | Standard deviation of native histogram observations. |
| `histogram_stdvar()` | `histogram_stdvar(v instant-vector)` | Variance of native histogram observations. |

**Classic histogram quantile pattern**:

```promql
# 95th percentile latency across all instances
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# Per-job 99th percentile
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (job, le)
)
```

### Mathematical & Clamping Functions

| Function | Description |
|----------|-------------|
| `abs(v)` | Absolute value |
| `ceil(v)` | Round up to nearest integer |
| `floor(v)` | Round down to nearest integer |
| `round(v, to_nearest=1)` | Round to nearest multiple of `to_nearest` |
| `clamp(v, min, max)` | Clamp values between min and max |
| `clamp_min(v, min)` | Clamp to minimum |
| `clamp_max(v, max)` | Clamp to maximum |
| `exp(v)` | Exponential (e^x) |
| `ln(v)` | Natural logarithm |
| `log2(v)` | Base-2 logarithm |
| `log10(v)` | Base-10 logarithm |
| `sqrt(v)` | Square root |
| `sgn(v)` | Sign: `1` (positive), `-1` (negative), `0` (zero) |

### Time & Date Functions

| Function | Description |
|----------|-------------|
| `time()` | Current Unix timestamp (seconds since 1970-01-01 UTC) |
| `timestamp(v)` | Timestamp of each sample in seconds |
| `day_of_month(v=vector(time()))` | Day of month: 1–31 |
| `day_of_week(v=vector(time()))` | Day of week: 0 (Sunday) – 6 (Saturday) |
| `day_of_year(v=vector(time()))` | Day of year: 1–366 |
| `days_in_month(v=vector(time()))` | Days in current month: 28–31 |
| `hour(v=vector(time()))` | Hour of day (UTC): 0–23 |
| `minute(v=vector(time()))` | Minute of hour: 0–59 |
| `month(v=vector(time()))` | Month: 1–12 |
| `year(v=vector(time()))` | Year |

### Label & Vector Manipulation

| Function | Signature | Description |
|----------|-----------|-------------|
| `vector()` | `vector(s scalar)` | Converts scalar to instant vector with no labels |
| `scalar()` | `scalar(v instant-vector)` | Converts 1-element vector to scalar; `NaN` if length ≠ 1 |
| `label_replace()` | `label_replace(v, dst, repl, src, regex)` | Regex match against `src` label, write captures to `dst` label |
| `label_join()` | `label_join(v, dst, sep, src_1, ..., src_n)` | Join multiple source label values into `dst` separated by `sep` |
| `sort()` | `sort(v)` | Sort ascending by sample value |
| `sort_desc()` | `sort_desc(v)` | Sort descending by sample value |

**`label_replace` example** — extract service name from instance label:

```promql
label_replace(up{job="api"}, "service", "$1", "instance", "(.+):.+")
```

### Aggregation Over Time Functions

All take a range vector and return an instant vector:

| Function | Description |
|----------|-------------|
| `avg_over_time(v[d])` | Average value over duration |
| `min_over_time(v[d])` | Minimum value over duration |
| `max_over_time(v[d])` | Maximum value over duration |
| `sum_over_time(v[d])` | Sum of values over duration |
| `count_over_time(v[d])` | Count of samples over duration |
| `quantile_over_time(φ, v[d])` | φ-quantile over duration |
| `stddev_over_time(v[d])` | Standard deviation over duration |
| `stdvar_over_time(v[d])` | Variance over duration |
| `mad_over_time(v[d])` | Median absolute deviation over duration |
| `last_over_time(v[d])` | Most recent sample value |
| `present_over_time(v[d])` | Value `1` for any series with samples in range |
| `changes(v[d])` | Number of times the value changed |

### Presence / Absence Functions

| Function | Description |
|----------|-------------|
| `absent(v)` | Returns 1-element vector with value `1` if input is empty; empty if input has elements |
| `absent_over_time(v[d])` | Returns `1` if input range vector has no samples in the range |

**Dead-man's switch alerting pattern**:

```promql
# Alert if no samples received from job in 15 minutes
absent(up{job="myservice"})
# or
absent_over_time(up{job="myservice"}[15m])
```

## Operator Precedence (Highest to Lowest)

1. `^` (right-associative)
2. `*`, `/`, `%`, `atan2`
3. `+`, `-`
4. `==`, `!=`, `<=`, `<`, `>=`, `>`
5. `and`, `unless`
6. `or`

Parentheses override precedence.

## Staleness

- A time series becomes **stale** if no sample is found within the last 5 minutes
  (default lookback delta)
- When a target disappears, explicit staleness markers are injected at the end of the
  last scrape to allow immediate stale detection
- `track_timestamps_staleness: true` in scrape config inserts staleness markers when
  metrics with explicit timestamps disappear
