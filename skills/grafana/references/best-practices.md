# Best Practices

## Dashboard Design

1. **One dashboard, one audience** — a NOC wall, a service owner's view, and a
   debugging view are different dashboards, not tabs.
2. **Structure top-down**: overview row (stats/summary) → per-signal detail →
   raw/debug at the bottom. The first row must answer "is it healthy?" in 5
   seconds.
3. **Consistent row names & ordering** across dashboards in a fleet (Overview →
   Errors → Latency → Saturation → Alerts) — reviewers and on-call rely on
   muscle memory.
4. **RED/USE method**: services get Rate/Errors/Duration; infrastructure gets
   Utilization/Saturation/Errors.
5. **Small multiples over selector soup**: repeat panels by variable instead of
   cramming 40 series into one graph; legends with `mean`/`max` calcs, table
   placement at the bottom.
6. **Cap auto-refresh** (≥30s; 1m for ranges >24h) — hammering heavy queries at
   5s from 20 wall screens degrades the data source, not just Grafana.
7. **Numbers with context**: set `unit`, `min`/`max`, and thresholds on every
   stat/gauge; a bare "83" means nothing.
8. Name series deliberately: `legendFormat: "{{instance}} — {{mode}}"`; if the
   legend is unreadable, fix the query, not the panel width.

## Naming Conventions

| Object | Convention | Example |
|--------|------------|---------|
| Dashboard | `[Env] Domain — Purpose` | `[Prod] CDN — Origin Health` |
| Tags | lowercase, no spaces, env+domain | `prod`, `cdn`, `gateway` |
| Variables | snake_case, domain prefix in shared libs | `dc_`, `svc_`, `instance` |
| Alert rules | Symptom-based, all-caps readable | `HighErrorRate5xx` |
| Folders | Team or domain; `Alerts` folder per team for rules | `Platform`, `Alerts/Platform` |

Tags power the search API and mass operations (`/api/search?tag=prod`) — treat
them as part of the contract.

## Query & Performance

1. Prefer `$__rate_interval` in `rate()`/`increase()` windows — it adapts to
   scrape interval and panel width and avoids empty/erratic windows.
2. Aggregate in the data source, not in the browser — `sum by (dc)` in PromQL
   beats pulling 500 series and reducing in the panel.
3. Bound cardinality: chain variables so `All` is meaningful; avoid
   `allValue: ".*"` against huge label spaces.
4. `min-max` over every replica: use recording rules (Prometheus) for expensive
   expressions consumed by many dashboards.
5. `instant: true` + stat panels for "current value"; range queries only for
   time series.
6. Set `timeInterval` on the Prometheus data source to the scrape interval (see
   [Data Sources](data-sources.md)) — this alone fixes most "rate looks wrong"
   complaints.
7. Watch `grafana_` self-metrics and data source QPS; a dashboard used in a
   NOC wall × refresh interval × panels is a load model — budget it.

## Alerting Practice

1. **Alert on symptoms, page on symptoms**; alerts on causes belong to ticket
   severity (`severity: ticket`), not paging.
2. Every rule carries: `runbook_url`, `severity` (`critical|warning|ticket`),
   `team`, and a `summary` annotation with the current value.
3. `for` ≥ 2× evaluation interval; add `keep_firing_for: 2m` on flappy rate
   rules; deliberate NoData behavior per rule (see [Alerting](alerting.md)).
4. Route by labels, not per-rule policies — the notification policy tree reads
   `severity`/`team`; adding a rule should require zero policy edits.
5. Group notifications by `alertname` (+ folder), with `group_wait: 30s` /
   `repeat_interval: 4h`; paging branches with `group_wait: 0s` and shorter
   repeats.
6. Test with synthetic rules + the webhook contact point before enabling paging
   channels; verify routing (not just delivery) — contact point "test" bypasses
   the policy tree.
7. Review fired-but-not-acknowledged rate monthly; dead rules that never fire or
   always fire both get deleted.

## Grafana as Code

1. Provision everything: data sources, dashboards, folders, alerting (see
   [Provisioning](provisioning.md)); UI `editable: false` / `allowUiUpdates: false`.
2. Pin UIDs on every object; never rely on generated ones.
3. Store dashboards as exported JSON with bumped `version`; validate JSON and
   relative links in CI (this repo's `node scripts/validate.js` covers links).
4. Terraform (`grafana` provider) for API-driven environments (Grafana Cloud,
   multi-instance fleets): `grafana_folder`, `grafana_dashboard`,
   `grafana_rule_group`, `grafana_contact_point`,
   `grafana_notification_policy`, `grafana_service_account` — see
   [terraform-grafana-as-code.tf](../examples/terraform-grafana-as-code.tf).
5. Promotion between environments = same UID, environment-specific data source
   UIDs/folders injected by pipeline — not hand-edited JSON copies.
6. One PR per change with a screenshot — dashboards are visual; reviewers need
   to see the rendered result.

## Operating Conventions

1. Break-glass local admin + SSO mapped to roles/teams (see
   [RBAC & Administration](rbac-and-administration.md)).
2. Rotate service account tokens; one token per integration with expiry.
3. Keep plugin set minimal and pinned; bake into the image.
4. Back up the DB (dashboards/users/alerts live there) and treat the provisioning
   repo as the DR seed.
5. Document the on-call dashboard set (which 3 dashboards to open during an
   incident) in the runbook, not in tribal memory.

## Common Anti-Patterns

- The 60-panel mega dashboard with `5s` refresh on `now-30d`.
- `All` variables built as `.*` regex over high-cardinality labels.
- Alerting on causes (CPU) with paging severity while missing the symptom (SLO
  burn).
- Hand-edited dashboards in prod UI with provisioning running — silent drift.
- Secrets in `jsonData` or committed contact point URLs.
- Per-user folder permissions that no one dares to clean up.
