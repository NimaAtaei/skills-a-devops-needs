# Data Sources

## General Model

A data source connection holds: a **name** (display), a **uid** (reference key),
**type**, **URL/access mode**, authentication, and type-specific
`jsonData` (readable) + `secureJsonData` (write-only, encrypted at rest).

- **Access mode `proxy`** (default, preferred) — Grafana server relays queries;
  the browser never touches the telemetry endpoints; enables CORS-free
  dashboards, caching, and rate limiting at the proxy.
- **Access mode `browser`** (direct) — browser calls the data source URL with
  credentials from Grafana; only for niche cases (client-only sources).
- **UID addressing** — panels, alert rules, and Terraform should reference
  `{ "type": "prometheus", "uid": "prom-prod" }`, never by name — names get
  renamed, UIDs (explicitly provisioned) do not.

## Provisioning JSON Schema (per source)

```yaml
datasources:
  - name: Prometheus
    uid: prom-prod
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: 15s
      httpMethod: POST
      prometheusType: Prometheus
      prometheusVersion: 3.0.0
    secureJsonData:
      httpHeaderValue1: "Bearer ${__env{PROM_TOKEN}}"
  - name: Loki
    uid: loki-prod
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
      derivedFields:                      # link log lines to traces
        - datasourceUid: tempo-prod
          matcherRegex: "traceID=(\\w+)"
          name: TraceID
          url: "$${__value.raw}"
```

Secrets belong in `secureJsonData` with `${__env{VAR}}` or `${__file{/path}}`
interpolation — see [Provisioning](provisioning.md).

## Common Data Sources — What to Configure

| Data source | Important settings |
|-------------|--------------------|
| Prometheus / Mimir | `timeInterval` = scrape interval (powers `$__rate_interval`), `httpMethod: POST` for long matchers, `manageAlerts` off if using Grafana-managed only, `exemplarTraceIdDestinations` to jump to Tempo |
| Loki | `maxLines`, derived fields → Tempo, `timeout`; use LogQL `stream selectors` first, filter after |
| Tempo / Jaeger / Zipkin | Node graph + service graph config; traces-to-metrics links |
| PostgreSQL / MySQL | `maxOpenConns` / `maxIdleConns` sized to the DB, `connMaxLifetime`, read-only user, `timezone` handling; `secureJsonData.password` |
| Elasticsearch | `timeField` (`@timestamp`), ES version, log/message field mapping |
| InfluxDB (v1/v2) | Bucket vs database, Flux vs InfluxQL |
| Zabbix (community app `alexanderzobnin-zabbix-app`) | Requires app + datasource plugin installed; URL to Zabbix API, API token auth; brings triggers/problems/SLA panels — natural bridge for Zabbix shops |
| TestData | Synthetic series for dashboard prototyping and demos — keep disabled in prod |

## SQL Data Sources — Patterns

- Use **read-only credentials**; Grafana queries are concurrent and unbounded by
  user workload.
- Parameterized queries with template variables need explicit quoting:
  `WHERE host IN (${host:singlequote})` (see
  [Template Variables](template-variables.md) formatting table).
- Large table panels: `LIMIT` + `ORDER BY` server-side, paginate in panel; never
  `SELECT *` on wide tables into a table panel.
- Stored-procedure / query caching: consider a materialized view or caching proxy
  for expensive reports refreshed by many viewers.

## Datasource Permissions

- OSS: permissions live at folder/dashboard level; data sources are org-wide.
- Enterprise: per-data source permission lists and a **caching layer** per source
  (memory/Redis) with per-datasource TTLs — pair with query limits for expensive
  SQL sources.
- Use dedicated Grafana service accounts per integration (CI, alerting pipelines)
  instead of user tokens — see
  [RBAC & Administration](rbac-and-administration.md).

## Health, Provenance & Debugging

- `GET /api/datasources/uid/{uid}/health` — per-source health check (what the UI
  "Save & test" runs).
- `provenance` field on API responses (`file`/`api`) tells whether an object is
  provisioned and read-only.
- Server logs (`gf_debug` levels, `[log] level = debug`) surface proxy errors —
  most "Data source not found"/timeout issues are UID mismatches, wrong `access`
  mode, or LB/DNS problems between Grafana and the source.
- The browser console + Grafana `explore` metrics panel show query round-trip
  times; compare against querying the data source directly to isolate Grafana
  overhead.

## Common Pitfalls

1. Data source recreated without the original `uid` — every dashboard and rule
   referencing the old UID breaks; always pin UIDs in provisioning.
2. `timeInterval` unset for Prometheus — `$__rate_interval` falls back to coarse
   defaults and `rate()` windows look noisy or empty.
3. `browser` access mode in a zero-trust network — leaks data source credentials
   and topology to every viewer.
4. Committing `secureJsonData` equivalents in plaintext (e.g. Slack URLs in
   contact points without `${__env{...}}`).
5. Too many `maxOpenConns` on a SQL source from every Grafana replica — multiply
   per replica when sizing.
6. Community plugin (e.g. Zabbix app) upgraded outside Grafana upgrades — check
   plugin compatibility matrix per Grafana major version.

Full provisioning examples:
[provisioning-datasources.yaml](../examples/provisioning-datasources.yaml).
