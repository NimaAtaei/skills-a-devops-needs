---
name: grafana
description: >
  Grafana observability platform — dashboard authoring and the dashboard JSON model,
  panel types and queries, template variables, provisioning as code (data sources,
  dashboards, plugins, alerting), unified alerting with Grafana-managed and
  datasource-managed rules, notification policies and contact points, data source
  configuration, transformations, RBAC and administration, and operational best
  practices for Grafana 13.x.
---

# Grafana Dashboards & Alerting

Comprehensive reference for building, provisioning, and operating Grafana: the
dashboard model, panels and queries, variables, file-based provisioning, unified
alerting, notification routing, administration, and as-code workflows.

## When to Use This Skill

Activate when the task involves:

- Authoring or debugging **dashboards** — panel layout (`gridPos`), query `targets`,
  annotations, dashboard links, or the dashboard JSON model
- Writing **template variables** — query variables, chained filters, `$var` formatting,
  repeating panels or rows
- Creating **provisioning files** under `conf/provisioning/` for data sources,
  dashboards, plugins, or alerting resources
- Building **alert rules** — Grafana-managed vs datasource-managed rules, expression
  chains (reduce, threshold, math), `for` / `keep_firing_for`, NoData and error handling
- Designing **notification policies** and **contact points** — grouping, group wait /
  group interval / repeat interval, mute timings, silences
- Configuring **data sources** — Prometheus, Loki, SQL data sources, the Zabbix plugin,
  `secureJsonData`, UID-based addressing
- Managing **users, teams, folders, permissions, and service accounts**, or the
  `grafana.ini` configuration and high-availability deployment
- Running **Grafana as code** — Terraform provider, JSON export/import, GitOps flows

## Reference Docs

| Document | Covers |
|----------|--------|
| [Architecture & Concepts](references/architecture-and-concepts.md) | Platform layout, OSS vs Cloud, orgs/folders/users, plugin model, HTTP API surface, HA deployment |
| [Dashboards & Panels](references/dashboards-and-panels.md) | Dashboard JSON model, `gridPos`, panel types, query targets, annotations, transformations, library panels, time ranges |
| [Template Variables](references/template-variables.md) | Variable types, query variables, multi-value and All, chained filters, `${var:format}` options, repeat panels, global variables |
| [Provisioning](references/provisioning.md) | File-based provisioning schema for data sources, dashboards, plugins, and alerting, `$__env` / `$__file` interpolation, GitOps patterns |
| [Alerting](references/alerting.md) | Unified alerting model, Grafana-managed and datasource-managed rules, expression queries, state machine, notification policies, contact points, mute timings, silences |
| [Data Sources](references/data-sources.md) | Data source types and provisioning JSON, UID addressing, `secureJsonData`, SQL data sources, community plugins (Zabbix), permissions |
| [RBAC & Administration](references/rbac-and-administration.md) | Org roles, teams, folder and dashboard permissions, service accounts and tokens, `grafana.ini` essentials, LDAP/OAuth, HA setup |
| [Best Practices](references/best-practices.md) | Dashboard design conventions, naming, query performance, `$__rate_interval`, as-code workflows, alert tuning, upgrade hygiene |

## Example Configurations

| Example | Purpose |
|---------|---------|
| [dashboard-json-model.json](examples/dashboard-json-model.json) | Production Prometheus dashboard JSON: timeseries/stat panels, query variable, annotations, `gridPos` layout |
| [provisioning-datasources.yaml](examples/provisioning-datasources.yaml) | Provisioning file for Prometheus (default), Loki, and PostgreSQL data sources with `$__env` secrets |
| [provisioning-dashboards.yaml](examples/provisioning-dashboards.yaml) | Dashboard providers with folder scanning and `foldersFromFilesStructure` |
| [provisioning-alerting.yaml](examples/provisioning-alerting.yaml) | Provisioned alert rule group (reduce + threshold expressions), contact points (Slack + webhook), notification policy timings |
| [terraform-grafana-as-code.tf](examples/terraform-grafana-as-code.tf) | Grafana Terraform provider: folder, dashboard, data source, rule group, contact point, service account |
| [annotations-and-repeat-panels.json](examples/annotations-and-repeat-panels.json) | Dashboard with Prometheus annotation queries, repeating panels by variable, and a transformed table |
