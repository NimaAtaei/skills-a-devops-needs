# Templates & Macros

Templates package items, triggers, graphs, dashboards, and LLD for reuse across
hosts. Macros parameterize them. Tags glue them to routing and services.

## Template Inheritance

```text
Template OS Linux by Zabbix agent 2
   └── Template Custom Linux Health (nested/linked)
          └── Host web-01  (host-level overrides)
```

- **Nested templates** (6.0+) — a template can contain other templates; the
  inheritance chain flows down with host-level overrides at the bottom.
- **Linked templates** — the classic attach-to-host model; both coexist, prefer
  nesting for layered customization.
- Host-level entities (extra items, overridden intervals) always win over
  template values — audit drift with frontend "Latest data → inherited from"
  or the API (`host.get` + `selectParentTemplates`).
- Mass update in the frontend or API for fleet-wide changes; template-wide
  changes propagate instantly to every linked host (config sync within ~a minute).

## Official Templates

- The official template set (in the zabbix git repo, `templates/`) covers OS,
  DBMS, web servers, network gear, cloud — link them as-is; customize by
  **cloning into your own template** only when forked behavior is unavoidable.
- `Linux by Zabbix agent 2`, `PostgreSQL by Zabbix agent 2` etc. ship sane
  discovery, LLD overrides, and dashboards — start there before inventing keys.
- Upgrades of official templates: import the new YAML; watch for
  renamed/discovered items breaking local graphs (Zabbix migrates by name/uuid).

## Macros

| Kind | Syntax | Scope |
|------|--------|-------|
| Built-in event macros | `{ITEM.LASTVALUE1}`, `{EVENT.SEVERITY}`, `{HOST.NAME}`, `{EVENT.AGE}` | Trigger names, messages |
| User macros | `{$CPU.THRESHOLD}` | Host → template (child→parent) → global |
| Context (expression) macros | `{$DISK.THRESHOLD:"/data"}` | Per-context overrides (e.g. per mountpoint) |
| LLD macros | `{#FSNAME}`, `{#IFNAME}`, custom from discovery JSON | Prototypes and their instances |
| Secret macros | `{$PASSWORD}` with "Secret text"/"Vault secret" type | Credentials in scripts/HTTP items |

- Precedence: **host-level** beats template-level beats global; more-specific
  context beats bare macro (6.4+ expression macros even compute from LLD
  values, e.g. `{$CPU.WARN:avg(/{#FSNAME},5m)}`-style expressions).
- `$$` escapes a literal `$` in commands and scripts.
- **Secret macros** keep passwords out of plaintext config dumps and the API —
  always prefer them over literal credentials inside HTTP agent headers or
  script parameters (see [Items & Data Collection](items-and-data-collection.md)
  for HTTP auth usage).
- Global macros are the last-resort default; per-template defaults keep hosts
  predictable (`{$CPU.UTIL.CRIT}` shipped by official templates).

## Tags Strategy

Every trigger in a custom template should define, at minimum:

| Tag | Purpose |
|-----|---------|
| `team` | Notification routing (action conditions) |
| `severity` | Redundant-but-useful routing key independent of Zabbix severity |
| `env` | prod/stage — protects NOC from test noise |
| `component` | service/tree mapping for SLA views |

Tags also appear on items/host level (item tags enrich problems with
`{ITEM.TAG...}`-style context in newer versions). Consistency beats cleverness:
lowercase values, no spaces, one source of truth per tag key.

## Template Design Checklist

1. One template per **kind of thing** (OS, appliance, app) — not per customer.
2. Triggers reference their own template's items only (`/host/key` of the
   templated host), never literals of other hosts.
3. Thresholds are macros, not literals — `last(/host/system.cpu.util)>{$CPU.UTIL.CRIT:"avg5"}`.
4. Discovery prototypes have filters and overrides tuned for reality — see
   [Items & Data Collection](items-and-data-collection.md).
5. Ships tags on every trigger; names are human-readable with macro substitution.
6. Items set units, history/trends retention explicitly (short history, long trends).
7. Dashboards attached to the template give the "one look" per host type.
8. Export to YAML (`configuration.export`) and keep in Git — see
   [template-linux-custom-health.yaml](../examples/template-linux-custom-health.yaml)
   for a minimal skeleton and [API](api.md) for automated export.

## Host Onboarding Patterns

- **Manual**: create host → attach templates → set macros → verify Latest data.
- **Auto-registration** (active agents): agent config `HostMetadataItem` emits a
  fingerprint; an auto-registration action (with PSK enforced) creates the host,
  assigns host group + templates — the fleet-scale path (see
  [Actions & Alerting](actions-and-alerting.md) for the action half).
- **API bulk** (see [API](api.md)) for scripted onboarding from CMDB.
- Discovery + registration actions should both be tag/PSK-guarded — an open
  auto-registration action is an easy way to pollute a NOC with junk hosts.

## Common Pitfalls

1. Editing official templates in place — upgrades overwrite; clone when forking.
2. Passwords as plain user macros — use secret macro type.
3. Global macros as tuning defaults — one change silently retunes 5000 hosts.
4. LLD without filters — disk/if discovery storms; always filter and set
   keep/delete periods deliberately.
5. Host-level overrides nobody remembers — drift audit via API before assuming
   template values are in effect.
