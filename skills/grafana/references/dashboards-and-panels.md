# Dashboards & Panels

## Dashboard JSON Model

A dashboard is a JSON document. Provisioning, the API, and Terraform all speak this
same model; the UI is an editor for it.

```json
{
  "uid": "prod-overview",
  "title": "Production Overview",
  "tags": ["prod", "core"],
  "schemaVersion": 40,
  "editable": true,
  "graphTooltip": 1,
  "refresh": "30s",
  "time": { "from": "now-6h", "to": "now" },
  "timepicker": { "refresh_intervals": ["30s", "1m", "5m"] },
  "templating": { "list": [] },
  "annotations": { "list": [] },
  "panels": [],
  "links": []
}
```

Fields that matter most in operation:

| Field | Notes |
|-------|-------|
| `uid` | Stable identifier — set it yourself; required for Terraform/API/GitOps workflows |
| `schemaVersion` | Migration version of the model; Grafana upgrades dashboards on load, so older JSON stays importable |
| `editable` | `false` + `graphTooltip: 1` for curated production dashboards that should not drift |
| `refresh` | Cap at ≥30s for expensive queries; avoid `5s` refresh on long ranges |
| `time` | Default range shown on load |
| `templating.list` | Ordered variables; order matters for chained queries |
| `panels` | Flat array (nested rows are panels too); position from `gridPos` |

## Panel Anatomy

```json
{
  "type": "timeseries",
  "title": "CPU usage",
  "id": 1,
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
  "datasource": { "type": "prometheus", "uid": "prom-prod" },
  "targets": [
    {
      "refId": "A",
      "expr": "100 - avg(rate(node_cpu_seconds_total{mode=\"idle\",instance=~\"$instance\"}[5m])) * 100",
      "legendFormat": "{{instance}}"
    }
  ],
  "fieldConfig": {
    "defaults": {
      "unit": "percent",
      "min": 0,
      "max": 100,
      "thresholds": { "mode": "absolute", "steps": [ {"color": "green", "value": null}, {"color": "red", "value": 85} ] },
      "custom": { "fillOpacity": 10, "lineInterpolation": "smooth" }
    },
    "overrides": [
      { "matcher": { "id": "byName", "options": "db-01" },
        "properties": [ {"id": "color", "value": {"mode": "fixed", "fixedColor": "red"}} ] }
    ]
  },
  "options": { "legend": { "displayMode": "table", "placement": "bottom", "calcs": ["mean", "max"] } }
}
```

- `gridPos` — `w`/`x` are 1–24 columns, `h`/`y` in 30px rows; panels may overlap
  if `x`/`y` collide — always lay out left-to-right, top-to-bottom.
- `fieldConfig.defaults` vs `overrides` — overrides match by field name, regex,
  frame, or type; use overrides for a single outlier series instead of duplicating
  panels.
- `targets[].refId` — query letters (`A`, `B`, ...); the same model powers alert
  expression chains (see [Alerting](alerting.md)).

## Panel Types — What to Use When

| Type | Use for |
|------|---------|
| `timeseries` | Default for anything over time; supports axes, thresholds, annotations, gradients |
| `stat` / `gauge` / `bargauge` | Current value + thresholds; pair with `reduce` transformation or `instant` queries |
| `table` | Multi-column results; combine with transformations for inventory views |
| `heatmap` | Latency/duration distributions (prometheus `histogram_quantile` heatmaps) |
| `state-timeline` / `status-history` | Up/down states, config drift, machine states over time |
| `logs` | Loki/EL log streams with derived fields |
| `traces` / `flamegraph` | Tempo/Jaeger traces; flamegraph for profiles (Parca/Pyroscope) |
| `nodeGraph` | Topology: service graphs, dependency maps |
| `geomap` | Location data (CDN PoPs, devices) |
| `piechart` / `barchart` | Composition/comparison; avoid pie charts with >6 slices |

## Transformations

Transformations run on query results in the browser, before rendering — they change
what panels see but not what alerts evaluate (alerts use the raw query results).

Frequently used, in realistic pipelines:

| Transformation | Typical use |
|----------------|-------------|
| `organize` | Rename/reorder/hide columns |
| `merge` / `joinByField` | Combine frames from different queries on a shared field (e.g. `instance`) |
| `reduce` | Collapse series to min/max/mean/last — feeds stat panels |
| `sortBy` | Deterministic table ordering |
| `filterFieldsByName` / `filterByValue` | Trim wide results |
| `calculateField` | Derived column (arithmetic between fields, e.g. bytes → percent) |
| `extractFields` | Split label strings (`host=dc1,role=api`) into columns |
| `groupBy` | Aggregate rows for inventory summaries |
| `renameByRegex` | Normalize series/legend names across queries |
| `rowsToFields` | Convert rows (label/value pairs) into columns for stat rows |

Order matters — transformations apply sequentially; a `joinByField` after a
`limit` will silently drop rows.

## Annotations

Annotations overlay events on graphs. Two flavors:

1. **Query annotations** — pull events from a data source on each dashboard load:

```json
{
  "datasource": { "type": "prometheus", "uid": "prom-prod" },
  "enable": true,
  "expr": "changes(prometheus_config_last_reload_successful_timestamp_seconds[5m]) > 0",
  "titleFormat": "Config reload",
  "tagKeys": "instance"
}
```

2. **Built-in region annotations** — manual/added via API
   (`POST /api/annotations`) with `dashboardUID`/`panelId` scoping, tags, and
   time ranges; use the API for deploys/incidents from CI pipelines.

## Time Ranges & Refresh

- Dashboard `time` + user override; panels may pin an absolute range via
  `timeFrom`/`timeShift` (prefer sparing use — hurts comparability).
- `$__interval`, `$__auto_interval_interval`, `$__range` (see
  [Template Variables](template-variables.md)) control query bucketing.
- `refresh` is a dashboard-level default; keep ≥30s for range >24h; heavy
  dashboards should disable auto-refresh and rely on manual reload.
- Relative ranges (`now-6h`) are interpreted at query time — URLs with relative
  ranges make good shareable links; use `kiosk` mode (`?kiosk=tv`) for NOC wall
  displays.

## Dashboard Links & Navigation

- **Links** (`links[]`) — dropdown of URLs/other dashboards; pass variables via
  `$__all_variables` style URL params (`?var-instance=$instance`).
- **Data links** — per-field links in panels (e.g. from a service panel to its
  runbook dashboard with `${__field.labels.service}`).
- Prefer folder-per-team + dashboard links over one mega-dashboard; a NOC wall
  usually wants 3–4 curated dashboards, not 40 tabs.

## Library Panels

- Create from any panel ("Share → Add to library"); store once, reference by UID.
- Consuming dashboards show the panel read-only unless they copy it out.
- Update via the library panel editor — changes propagate to all dashboards using
  it (deltas show in dashboard history as version bumps).
- In provisioning/Terraform, library panels are separate resources
  (`grafana_library_panel` in Terraform) referenced by dashboard JSON.

See [Best Practices](best-practices.md) for layout and naming conventions and
[Template Variables](template-variables.md) for the variable model used inside
`templating.list`.
