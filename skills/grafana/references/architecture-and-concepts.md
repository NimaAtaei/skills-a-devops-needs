# Architecture & Concepts

## Platform Layout

Grafana is a single Go binary (plus an embedded React front end) that renders
dashboards and evaluates alerts on top of **data sources** — it does not store
telemetry itself. Queries are issued from the browser for dashboards and from
the server for alert rules, recorded queries, and report rendering.

```text
Browser ──▶ Grafana ──▶ Data sources (Prometheus, Loki, SQL, ...)
              │
              ├── Dashboard rendering (panels, transformations in the browser)
              ├── Unified Alerting (server-side rule evaluation + scheduler)
              ├── Provisioning (files → data sources, dashboards, alerting)
              └── HTTP API (/api/...)
```

Key consequence for operations: **dashboard queries run with the user's browser
credentials path** (through Grafana's data source proxy), while **alert rules run
server-side** — an alert must work without any browser open, so always test rule
queries through the alert rule editor, not only in Explore.

## Editions

| Edition | Notes |
|---------|-------|
| OSS | Full dashboarding, provisioning, unified alerting, basic RBAC. Free. |
| Enterprise | Adds custom roles, data source permissions, fine-grained RBAC, datasource caching, reporting, audit logs. |
| Cloud / Stack | Managed; adds hosted Prometheus (Mimir), Loki, Tempo, and OnCall. |

This skill targets behavior that is stable across OSS 10 → 13. Where a feature is
edition-specific (custom roles, caching) it is called out explicitly.

## Tenancy Model

- **Organizations** — top-level isolation of data sources, dashboards, teams. Most
  self-hosted deployments use a single org.
- **Folders** — group dashboards; carry their own permission lists; root for
  alert rule groups and for provisioning layout.
- **Teams** — user groups that can be granted folder/dashboard permissions.
- **Users** — belong to an org with a role (Viewer / Editor / Admin); one special
  **Grafana (server) admin** role manages orgs, users, and global config.

## Dashboard Storage & Addressing

- Every dashboard has a **UID** (`grafana/dashboards/uid/<uid>`); prefer stable
  UIDs over numeric IDs in links, Terraform, and API calls.
- Dashboard **versions** are stored for history/rollback (compare/restore from the
  dashboard history view).
- **Library panels** are shared panel objects referenced by UID from many
  dashboards; editing the library panel updates every dashboard that uses it.

## Plugin Model

| Plugin type | Purpose | Examples |
|-------------|---------|----------|
| Data source | Query backend + query editor | Prometheus, Loki, PostgreSQL, MySQL, Zabbix |
| Panel | Visualization | Timeseries (built-in), Geomap, third-party |
| App | Bundles data sources + panels + pages | Zabbix app (`alexanderzobnin-zabbix-app`) |

Plugins live under `<paths.plugins>` (default `data/plugins`) and can be
pre-installed via provisioning or `grafana cli plugins install <id>`. Grafana
verifies plugin signatures; unsigned plugins require the
`plugins.allow_unsigned_plugins` setting (avoid in production).

## HTTP API Surface

Auth: `Authorization: Bearer <service-account-token>` (preferred) — legacy API keys
are per-org and deprecated in favor of service accounts.

| Area | Endpoint |
|------|----------|
| Health | `GET /api/health` |
| Search (dashboards, folders) | `GET /api/search?query=...` |
| Dashboard by UID | `GET /api/dashboards/uid/{uid}` |
| Save dashboard | `POST /api/dashboards/db` (body = dashboard JSON wrapper `{dashboard, folderUid, message, overwrite}`) |
| Folders | `GET/POST /api/folders`, `PUT /api/folders/{uid}` |
| Data sources | `GET/POST /api/datasources`, `GET /api/datasources/uid/{uid}` |
| Alert rules (Grafana-managed) | `GET/POST /api/v1/provisioning/alert-rules` (admin), `GET /api/ruler/grafana/api/v1/rules/{folder}` |
| Provisioned objects | `GET /api/v1/provisioning/...` for contact points, policies, mute timings |
| Org/users/teams | `/api/orgs`, `/api/users`, `/api/teams` |

## High Availability Deployment

Grafana is **stateless apart from its database**:

1. **Database** — point `grafana.ini [database]` at MySQL/PostgreSQL (not SQLite)
   when running more than one instance.
2. **Alerting HA** — unified alerting coordinates scheduling through the shared
   database (or Redis with `[unified_alerting] ha_redis_...` settings since Grafana 9);
   only one instance evaluates each rule group — no duplicate notifications.
3. **Session/state** — set `[security] cookie_secure`, keep login attempts config,
   and run N instances behind a plain HTTP load balancer (sticky sessions not
   required since Grafana 8+ JWT/session handling via DB).
4. **Shared assets** — use an object store or identical volumes for
   `<paths.plugins>` and `<paths.provisioning>` on every replica so all instances
   see the same plugins and provisioning files.
5. **Image renderer** — deploy `grafana-image-renderer` as a separate service
   (remote renderer) for notification screenshots and PDF reports; local Chromium
   per replica is wasteful and fragile.

## Configuration Precedence

1. Environment variables `GF_<SECTION>_<KEY>` (e.g. `GF_SECURITY_ADMIN_PASSWORD`) —
   highest priority, ideal for containers.
2. `grafana.ini` (`--config` flag or default location).
3. Built-in defaults.

See [RBAC & Administration](rbac-and-administration.md) for the sections that matter
in production and [Provisioning](provisioning.md) for the declarative model.
