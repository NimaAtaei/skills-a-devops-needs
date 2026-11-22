# Provisioning

Grafana reads **provisioning files** on startup (and dashboards on change) to
create/update data sources, dashboards, plugins, and alerting resources
declaratively — no manual UI setup, everything in Git.

## Directory Layout

Default: `<paths.provisioning>/provisioning/` (containers: `/etc/grafana/provisioning/`)

```text
provisioning/
├── datasources/    *.yaml    # data sources
├── dashboards/     *.yaml    # dashboard *providers* (where to scan for JSON)
├── plugins/        *.yaml    # plugin installation
├── notifiers/      *.yaml    # legacy notifiers (deprecated — use alerting/)
└── alerting/       *.yaml    # rule groups, contact points, policies, mute timings
```

## Data Sources

```yaml
apiVersion: 1

deleteDatasources:          # cleanup of removed sources (by name+org)
  - name: old-prometheus
    orgId: 1

datasources:
  - name: Prometheus
    uid: prom-prod          # stable UID — reference it in dashboards/alerts
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false         # locked from UI edits
    jsonData:
      httpMethod: POST
      timeInterval: 15s     # match scrape interval — improves $__rate_interval
      manageAlerts: false   # disable datasource-managed rules if unused
    secureJsonData:         # encrypted at rest; never appears in GET responses
      httpHeaderValue1: "Bearer ${__env{GRAFANA_PROM_TOKEN}}"

  - name: Loki
    uid: loki-prod
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      maxLines: 1000
```

Key mechanics:

- `uid` — set explicitly; dashboards, alert rules, and Terraform reference data
  sources by UID. Grafana-generated UIDs change if the source is recreated.
- `secureJsonData` values are write-only (stored encrypted); the pattern
  `${__env{VAR}}` injects from the process environment, `${__file{/path}}` from a
  mounted file — both keep secrets out of Git.
- `editable: false` prevents UI drift; the provisioning source stays the single
  source of truth.
- Changing a data source in Git requires a **Grafana restart** (or the newer
  reload endpoint); dashboards reload automatically.

## Dashboards

Dashboard provisioning is two-part: a **provider** says where to scan, JSON files
say what.

```yaml
# provisioning/dashboards/provider.yaml
apiVersion: 1

providers:
  - name: general
    orgId: 1
    folder: General
    folderUid: general
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: false      # keep Git as the only writer
    options:
      path: /var/lib/grafana/dashboards

  - name: mirrors-repo-layout
    orgId: 1
    type: file
    updateIntervalSeconds: 60
    allowUiUpdates: false
    options:
      path: /var/lib/grafana/dashboards-repo
      foldersFromFilesStructure: true   # subfolders → Grafana folders
```

- `allowUiUpdates: false` — UI edits are blocked; dashboards are Git-owned
  (recommended). With `true`, UI edits are allowed but provisioning files still
  win on next scan — a common confusion source.
- `foldersFromFilesStructure: true` mirrors the repo directory tree into Grafana
  folders — pair it with a repo layout `dashboards/team-a/x.json`.
- The scanner polls every `updateIntervalSeconds`; dashboard JSON changes
  (including from Git) appear without restart.
- Dashboard JSON should carry a stable `uid` and bumped `version` so Grafana can
  diff and update cleanly.

## Plugins

```yaml
apiVersion: 1

plugins:
  - type: datasource
    name: Zabbix
    id: alexanderzobnin-zabbix-datasource
```

Installing still requires the plugin binary to be present (`grafana cli plugins
install alexanderzobnin-zabbix-app` or baked into the image); provisioning only
marks it enabled. Bake plugins into the container image for reproducible deploys.

## Alerting

Alert resources provision under `alerting/` with `apiVersion: 1`:

```yaml
apiVersion: 1

groups:
  - orgIdentifier: 1
    folder: Alerts
    name: node-alerts
    interval: 1m
    rules:
      - uid: node-cpu-high-1
        title: Node CPU high
        condition: C
        for: 5m
        annotations:
          summary: "CPU > 90% on {{ $labels.instance }}"
        labels:
          severity: warning
        data:
          - refId: A
            relativeTimeRange: { from: 600, to: 0 }
            datasourceUid: prom-prod
            model: { expr: "100 - avg by(instance)(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100" }
          - refId: B
            datasourceUid: __expr__
            model: { type: reduce, reducer: lastNotNull }
          - refId: C
            datasourceUid: __expr__
            model: { type: threshold, conditions: [ { evaluator: { type: gt, params: [90] } } ] }

contactPoints:
  - orgIdentifier: 1
    name: oncall-slack
    receivers:
      - type: slack
        settings: { url: "${__env{SLACK_WEBHOOK_URL}}" }

policies:
  - orgIdentifier: 1
    receiver: oncall-slack
    group_by: [grafana_folder, alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

- Full worked example with nested policies and mute timings:
  [provisioning-alerting.yaml](../examples/provisioning-alerting.yaml)
- Provisioned alerting objects are **UI-read-only** (`provenance: file`) — edits
  must go through Git; API-provisioned objects show `provenance: api`.
- Rule `interval` is per **group**; keep groups coherent (same cadence + same
  folder) — Grafana schedules per group, so one heavy rule in a group delays all.
- `${__env{...}}`/`${__file{...}}` interpolation works in contact point settings —
  never commit webhook URLs.

## GitOps Patterns

1. **Repo layout** — one directory per environment (`envs/prod/...`) or per team;
   provisioning mounts point at the checked-out tree.
2. **Promotion** — same JSON, different `folder`/data source UID per environment
   via a templating step (envsubst/Kustomize-style) rather than hand-edited copies.
3. **Terraform alternative** — when Grafana APIs must be driven without file
   mounts (Grafana Cloud), use the Terraform provider; see
   [terraform-grafana-as-code.tf](../examples/terraform-grafana-as-code.tf).
4. **Validation in CI** — run `node scripts/validate.js` for link integrity, plus
   `grafana cli` dashboards linting or `jq .` on every dashboard JSON.
5. **Drift** — keep `editable: false` / `allowUiUpdates: false` so the UI cannot
   diverge from Git; inspect accidental drift with
   `GET /api/v1/provisioning/...` provenance fields.

## Common Pitfalls

1. Editing dashboards in the UI while `allowUiUpdates: true` — changes vanish on
   the next scan; either allow and export, or disallow and keep Git authoritative.
2. Data source UID mismatch after provisioning "fixes" — dashboards referencing
   the old UID show "Data source not found"; always set `uid` explicitly.
3. Putting secrets in `jsonData` (not `secureJsonData`) — they end up readable
   via the API.
4. Forgetting `folderUid` in providers — folder renames break permissions; UIDs
   are stable, names are not.
5. Restarting only some replicas behind an LB after provisioning changes —
   instances disagree on data source UIDs; rollout all replicas together.

See [Alerting](alerting.md) for the rule model and
[Data Sources](data-sources.md) for per-source JSON options.
