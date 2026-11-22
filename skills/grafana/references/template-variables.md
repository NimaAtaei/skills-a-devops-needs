# Template Variables

Variables make one dashboard serve many targets. They live in
`templating.list` (ordered) and are referenced as `$var` inside query strings.

## Variable Types

| Type | Purpose | Example |
|------|---------|---------|
| `query` | Values pulled from a data source (label values, table columns) | `label_values(up, instance)` |
| `datasource` | Lets the dashboard switch data sources | type `prometheus`, variable name `DS_PROM` |
| `custom` | Static list | `1m,5m,15m,1h` or key/value `prod : Production, stage : Staging` |
| `interval` | Time buckets for `$__interval`-style grouping | `30s,1m,5m,1h` |
| `textbox` | Free text input | hostname substring |
| `constant` | Hidden fixed value for repeated queries | default environment |
| `adhoc` | Free-form key/value filters (Prometheus/Loki/SQL supported) | ad-hoc label filtering |

Query variable definition (JSON model):

```json
{
  "name": "instance",
  "type": "query",
  "datasource": { "type": "prometheus", "uid": "${DS_PROM}" },
  "query": { "query": "label_values(up{job=\"node\"}, instance)", "refId": "StandardVariableQuery" },
  "regex": "/([^:]+):.*/",
  "sort": 1,
  "multi": true,
  "includeAll": true,
  "allValue": ".*",
  "current": {}
}
```

- `regex` filters/extracts display text from raw values (capture group 1 becomes
  the text when a capture exists).
- `sort` — 1: ascending (case-insensitive), 3: numerically ascending, 4/5:
  alpha/numeric descending. Numeric sort matters for ports/replicas.
- `includeAll` + `allValue` — the `All` option value; `.*` works for Prometheus
  regex matchers, but prefer explicit `label_values` intersection queries when
  `All` must be *meaningful* (fast and correct) rather than a giant regex.

## Chained Filters

Variables can query based on other variables — the canonical filter chain:

```text
datacenter → job → instance
```

```text
job:      query: label_values(up{datacenter=~"$datacenter"}, job)
instance: query: label_values(up{datacenter=~"$datacenter", job=~"$job"}, instance)
```

Rules for reliable chains:

1. Order variables top-down in `templating.list`; chained queries reference
   variables declared *above* them.
2. Always use the match-all regex form `=~"$var"` (not `="..."`) so multi-value
   and `All` work.
3. With multi-value variables, Grafana formats values per the formatting rule —
   the default for Prometheus queries is `{a,b}` inside `=~`, so `=~"$job"` is
   correct and `=\"$job\"` breaks with multiple selections.

## Formatting Interpolation: `${var:format}`

| Syntax | Result |
|--------|--------|
| `$var` / `${var}` | Default formatting for the data source |
| `${var:regex}` | Escape regex metacharacters |
| `${var:glob}` | `a,b` → `a\|b` (regex alternation) |
| `${var:pipe}` | `a,b` → `a\|b` (join with pipe) |
| `${var:csv}` | `a,b` → `a','b` |
| `${var:lucene}` | `a,b` → `a AND b` (ELK) |
| `${var:singlequote}` / `:doublequote` | SQL-style quoting (`'a','b'`) |
| `${var:sqlstring}` | SQL IN-string quoting |
| `${var:date:YYYY-MM-DD}` | Date formatting |
| `${var:urlencode}` | URL-safe for links |

Use them in panel titles, data links, and non-Prometheus queries; inside
Prometheus label matchers the plain `=~"$var"` idiom is preferred.

## Global / System Variables

| Variable | Meaning |
|----------|---------|
| `$__interval` | Grouping interval suggested by panel width × time range |
| `$__interval_ms` | Same in milliseconds |
| `$__auto_interval_interval` | Interval from dashboard `auto_interval` setting |
| `$__range` / `$__range_s/ms` | Selected dashboard time range (e.g. `1h`) |
| `$__rate_interval` | Recommended for Prometheus `rate()`: max($__interval × 4, scrape interval × 4) — avoids counter glitches on short windows |
| `$__dashboard`, `$__from`/`$__to`, `$__user` | Dashboard UID, range boundaries, current user |

## Repeating Panels & Rows

Set `repeat` (variable name) + `repeatDirection` (`h`/`v`) on a panel or row;
Grafana clones it per selected value:

```json
{ "repeat": "instance", "repeatDirection": "v", "maxPerRow": 4 }
```

- Horizontal repeat + `maxPerRow` builds clean grids of small multiples.
- Repeated panels inherit `$var` interpolation — each clone queries one value.
- Keep repeats bounded (All on a 300-instance fleet will render 300 panels —
  use chained filters or top-N queries instead).

## Common Pitfalls

1. **`All` as a giant regex** — `allValue: ".*"` against a huge label set makes
   queries slow and can hit Prometheus match-length limits; prefer intersection
   queries or `includeAll: false` on high-cardinality variables.
2. **Dashboard links missing variables** — a link to another dashboard must pass
   `?var-<name>=<value>`; `${var:urlencode}` for safety.
3. **Case sensitivity** — variable names are case-sensitive; `$Instance` ≠ `$instance`.
4. **Duplicate variable names** across imported dashboards silently shadow in
   JSON merges — keep names namespaced per domain (`dc_`, `svc_`).
5. **`interval` variable misuse** — an `interval` variable feeds
   `$__interval`; do not also interpolate it into `rate()[...]` windows —
   use `$__rate_interval` there.

See [Dashboards & Panels](dashboards-and-panels.md) for where variables appear in
the JSON model and [Best Practices](best-practices.md) for conventions.
