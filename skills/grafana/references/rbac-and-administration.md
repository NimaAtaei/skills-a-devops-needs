# RBAC & Administration

## Roles & Permissions Model

| Layer | Mechanism |
|-------|-----------|
| Organization role | Viewer / Editor / Admin — the baseline for everything in the org |
| Grafana Admin (server role) | Manages orgs, users, global settings — outside org content |
| Folders & dashboards | Explicit permission lists (per user/team/role) — inherit down the folder tree |
| Teams | Group users; grant folder access to teams, not individuals |
| Service accounts | Non-human identities with org roles + tokens (API/CI automation) |
| Custom roles & fine-grained RBAC | Enterprise: action/permission scoping (e.g. `dashboards:write` on specific scopes) |

Practical hierarchy that scales:

```text
Org
├── Team: noc            → Editor on folder "NOC"
├── Team: app-frontend   → Editor on folder "Frontend"
├── Team: app-frontend   → Viewer on folder "Platform"
└── Everyone else        → Viewer (org role)
```

- Folder permissions inherit to dashboards and nested folders; per-dashboard
  permissions override only what they explicitly state.
- Alert rule groups live in folders and follow folder permissions — Editors in a
  folder can manage that folder's rules.
- Avoid per-user grants; they rot. Grant to teams/roles.

## Service Accounts & Tokens

Preferred automation identity (replaces per-org API keys):

1. Create service account (role: Viewer for read-only dashboards API, Editor for
   provisioning writes, Admin only for admin APIs).
2. Add a token with expiry; scope per integration — one token per pipeline.
3. Use `Authorization: Bearer <token>` on `/api/...`.

Operational rules:

- Rotate on schedule; store in the CI secret store, never in repos.
- Least privilege: a dashboard-export CI job needs Viewer + `dashboards:read`,
  not Admin.
- Track token usage (`last_used_at` via API) and delete stale accounts.

## `grafana.ini` Essentials

```ini
[server]
root_url = https://grafana.example.com    # correct links/callbacks behind proxy
protocol = http                           # terminate TLS at the LB

[security]
admin_user = admin
admin_password = ${__env{...}}            # actually set via GF_SECURITY_ADMIN_PASSWORD
disable_initial_admin_creation = true     # after first setup
cookie_secure = true
allow_embedding = false                   # unless dashboards must embed elsewhere

[users]
auto_assign_org_role = Viewer             # default for new users — never Editor

[auth.anonymous]
enabled = false                           # enable deliberately, org role Viewer, hide_version

[auth]
disable_login_form = false
login_cookie_lifetime = 7d

[unified_alerting]
evaluation_timeout = 30s                  # must exceed slowest rule query

[database]
type = postgres
host = grafana-db:5432
password = ${__env{...}}                  # set via GF_DATABASE_PASSWORD
```

Priority reminder: `GF_<SECTION>_<KEY>` environment variables override the ini
file (see [Architecture & Concepts](architecture-and-concepts.md)).

## Authentication (SSO)

- **OAuth providers** (Azure AD/Entra, Google, Okta, GitLab, Keycloak):
  `[auth.oauth]` blocks + JWKS; map groups→teams/roles with
  `role_attribute_path` (JWT claim JMESPath).
- **LDAP** — `[auth.ldap]` with group-to-org-role mappings; useful for
  AD-based enterprises.
- SSO should map to *roles*, and team memberships to *teams* — then folder
  permissions on teams stay the only content-level grants.
- Always keep a break-glass local admin (SSO outage must not lock out the
  platform).

## Deployment & HA Checklist

1. External DB (PostgreSQL/MySQL); SQLite only for single-node lab.
2. N replicas behind LB; shared `provisioning/` + plugin volumes or baked image.
3. Alerting HA via shared DB (or Redis HA settings in `[unified_alerting]`).
4. `root_url` + `cookie_secure` correct for the ingress; TLS at LB.
5. Remote `grafana-image-renderer` service for alert/report screenshots.
6. Backups: DB dumps (dashboards/users/alerts are IN the DB) + provisioning repo
   (which should also be the disaster-recovery seed —
   see [Provisioning](provisioning.md)).
7. Metrics: expose `metrics.grafana_enabled = true`; scrape with Prometheus —
   watch `grafana_page_response_status` percentiles, alert evaluation lag,
   and DB connection saturation.

## Upgrades

1. Read breaking-change notes per major/minor (deprecations in plugins, alerting
   changes, schema migrations).
2. Snapshot/backup DB; test on a clone first.
3. Upgrade replicas rolling; schema migrations run on first instance — run with
   only one instance during migration (or use `grafana migrate` flow).
4. Plugin compatibility matrix before major Grafana bumps (Zabbix app, diagram,
   etc.).
5. After upgrade, verify: provisioning applied, alert rules evaluate, datasource
   health endpoints pass, dashboard JSON migration warnings in logs.

## Administration APIs

| Task | API |
|------|-----|
| Create/update org, users, teams | `/api/orgs`, `/api/users`, `/api/teams` |
| Folder + permissions | `/api/folders/{uid}/permissions` |
| Service accounts + tokens | `/api/serviceaccounts`, `/api/serviceaccounts/{id}/tokens` |
| Snapshots & annotations | `/api/snapshots`, `/api/annotations` |
| Server stats | `/api/admin/stats` |

See [Best Practices](best-practices.md) for the operational conventions that keep
a multi-team instance healthy.
