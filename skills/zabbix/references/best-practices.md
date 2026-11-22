# Best Practices

## Naming & Conventions

| Object | Convention | Example |
|--------|------------|---------|
| Item key | lowercase, dotted domain prefix for custom keys | `custom.queue.depth`, reuse official `vfs.fs.size[/,pused]` |
| Item visible name | Human phrase + scope | `Queue depth (orders service)` |
| Trigger name | Symptom sentence with macro substitution | `High error rate on {#IFNAME} ({ITEM.LASTVALUE1} errors/s)` |
| Tags | lowercase `key:value`, stable vocabulary | `team:noc`, `env:prod`, `component:gateway` |
| Host name | Matches inventory/CMDB FQDN or asset id | `web-01.example.com` |
| Templates | `Kind by <source>` mirrors official naming | `Linux by Zabbix agent 2` |

Names are part of the alert UX — the NOC reads trigger names at 3am; write them
for that reader.

## Alerting Philosophy

1. **Symptoms page, causes ticket.** Page on "customers are affected"
   (service down, error rate, saturation); record causes (disk fill trends,
   cert expiry warnings) as `Information/Warning` with tags, not pages.
2. Every paging trigger has: dependency on its host's reachability, `for`
   persistence, and a runbook link (tag or URL in the name).
3. Thresholds come from observed baselines, not folklore — export a month of
   trends and set thresholds at the noise floor before pages start.
4. Severity ladder discipline: `Disaster`/`High` mean "act now"; if High is
   routinely ignored, the ladder is wrong, not the operators.
5. Review fired-but-unacknowledged and acknowledged-but-unresolved problems
   monthly — both signal broken alerting, in opposite directions.

## Tags & Routing

- One tag vocabulary for the whole deployment (`team`, `env`, `component`,
  `severity`) — actions match tags, services map by tags (see
  [Triggers & Events](triggers-and-events.md)).
- `env` tags keep test hosts out of NOC actions; production actions condition
  on `env:prod` from day one.
- Adding a trigger should never require editing an action — if it does, the
  routing is string-matched and will rot.

## Collection Hygiene

1. Dependent items over duplicate polls: one master HTTP/DB query, many
   extracted metrics (see [Items & Data Collection](items-and-data-collection.md)).
2. `Discard unchanged (with heartbeat)` on slow gauges — the cheapest DB saver
   in the product.
3. LLD with filters + overrides; audit discovered-entity counts after every
   template rollout (discovery storms are the top scale accident).
4. Retention policy: history `7d`, trends `365d` as defaults; logs shorter,
   SLA-relevant items longer.
5. Prefer agent2 + its plugins over custom `UserParameter` scripts; keep
   `UserParameter` commands under the agent `Timeout`.

## Maintenance & Change Management

- Maintenance windows with data collection **kept** and actions suppressed —
  "no data" triggers must not page during planned work.
- Template changes: edit in a lab/stage host, export YAML, review in Git, then
  import to production (see [API](api.md) export/import).
- Fleet changes via mass update/API, never per-host hand edits — hand edits
  are invisible drift.

## Capacity Planning

- Track NVPS, items-per-host, and DB size monthly (internal items + SQL);
  forecast disk with trend math.
- Keep 30–40% poller headroom for incidents ("let's poll everything at 10s
  during the outage" happens).
- Proxy placement: one per site/DMZ; monitor proxies with the internal metrics
  set (see [Proxies & Scale](proxies-and-scale.md)).
- Backup = DB dumps + config as code; restore rehearsals matter more than
  backup schedules.

## Security

- PSK or cert TLS on every agent/proxy leg; frontend behind SSO with MFA.
- API tokens with expiry, one per integration, least-privilege roles (see
  [API](api.md)).
- `UserParameter` command injection: treat macro-expanded arguments as
  untrusted input; validate/sanitize inside the command.
- Least-privilege DB users for ODBC items; no shared admin accounts.

## Upgrade Discipline

- LTS to LTS only for production; read upgrade notes for config renames
  (e.g. proxy buffer changes in 7.0+).
- Order: DB backup → server (HA: node by node) → proxies → agents; keep
  proxies ≤ server version.
- Post-upgrade checklist: `zabbix[queue]` flat, escalations firing, webhook
  media type test delivery, proxy buffer mode intact.

## Common Anti-Patterns

- Monitoring everything at 1s "because storage is cheap" — the cost shows up
  as poller saturation and trigger latency, not just disk.
- Actions matching trigger names/text instead of tags.
- Global event correlation enabled to "reduce noise" — closes real incidents.
- Hand-edited hosts nobody documents; onboarding via API/mass-update only.
- A monitoring server nobody monitors — template the internal metrics set on
  every server/proxy and page on `zabbix[queue]`.
