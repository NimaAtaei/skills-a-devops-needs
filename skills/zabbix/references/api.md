# API

Everything the frontend does, the JSON-RPC API does: single endpoint
`api_jsonrpc.php`, JSON-RPC 2.0 envelope, ~100 `*.get/create/update/delete`
method families.

```json
{
  "jsonrpc": "2.0",
  "method": "problem.get",
  "params": { "output": ["eventid", "name", "severity"] },
  "id": 1
}
```

## Authentication

Two mechanisms:

1. **API tokens** (recommended, 5.4+): created in frontend (User settings →
   API tokens) with optional expiry; send as header:

   `Authorization: Bearer <token>`

2. **`user.login` / `user.logout`** session: returns an `auth` string used as
   the request `auth` field. Note: since 6.4 the `auth` request property is
   deprecated in favor of the Bearer header — new code should always use the
   header form.

Least privilege: dedicated API users per integration (read-only for dashboards,
limited role for automation); tokens expire — rotate like any secret.

## The `.get` Query Model

Every `.get` shares the same query vocabulary:

| Param | Purpose |
|-------|---------|
| `output` | Field list (`"extend"` is expensive — pick fields) |
| `filter` | Exact match: `{"status": 0}` (numeric enums!) |
| `search` / `searchWildcardsAllowed` | Substring search (`name`, `key_`) |
| `hostids` / `groupids` / `templateids` / `itemids` | Scoping |
| `monitored` | Only items/triggers on monitored hosts |
| `selectHosts` / `selectItems` / `selectTags` | Nested selects |
| `limit` + `preservekeys` | Pagination — iterate via `search` ranges or id cursors |
| `countOutput` | Return count only |
| `sortfield` / `sortorder` | Ordering |

Status/enum values are integers (item status `0=enabled`; trigger priority
`0..5` = Not classified..Disaster; problem severity matches the same scale).

## Key Methods

| Method | Purpose |
|--------|---------|
| `apiinfo.version` | Server version (no auth) |
| `host.get` | Hosts + interfaces + templates + macros |
| `hostgroup.get`, `template.get` | Inventory of config objects |
| `item.get` | Items; filter by `key_` (`host` + `key_` is the everyday lookup) |
| `trigger.get` | Triggers; with dependencies/severity |
| `problem.get` | **Currently open problems** (with `acknowledged`, `tags`, `latest` values) — NOC screen backbone |
| `event.get` | Full event history incl. resolved (`source:0, object:0` = trigger events) |
| `event.acknowledge` | Ack/close/message/change severity — see below |
| `history.get` | Raw history (`history: 0` float, `3` int, `4` text; `time_from` epoch) |
| `maintenance.create/get` | Maintenance windows programmatically |
| `configuration.export` / `configuration.import` | YAML/JSON export/import of templates/hosts/actions |
| `usergroup.get`, `user.get`, `role.get` | RBAC management |

## Acknowledging Events (NOC Workflow)

```json
{
  "method": "event.acknowledge",
  "params": {
    "eventids": ["123456"],
    "action": 6,             // bitflags: 1 close, 2 acknowledge, 4 add message, 8 change severity
    "message": "Accepted - investigating with network team",
    "severity": 4            // with action bit 8
  },
  "id": 2
}
```

Ticketing loops typically: `problem.get` (unacknowledged criticals) → create
ticket → `event.acknowledge` with the ticket id in the message → on resolution,
`event.get`/`problem.get` detects `r_eventid` and closes the ticket.

## Export / Import (Config as Code)

```json
{
  "method": "configuration.export",
  "params": {
    "options": { "templates": ["100100000010021"] },
    "format": "yaml"
  },
  "id": 3
}
```

- Export returns the YAML document (same shape as frontend export) — commit it
  to Git; see [template-linux-custom-health.yaml](../examples/template-linux-custom-health.yaml).
- `configuration.import` with `rules` flags (`updateExisting`, `createMissing`,
  `deleteMissing` per object class) — the `deleteMissing` flags are the footgun:
  they delete objects absent from the import file; scope them deliberately.
- CI pattern: export templates on a schedule, `git diff` them for drift —
  hand-edits in the frontend become visible reviewable changes.

## Automation Patterns

1. **Fleet onboarding from CMDB**: `hostgroup.get` (cache groups) → for each
   host `host.create` with `groups`, `templates`, `interfaces` (agent
   `useip`/`dns`), `macros` — then verify collection via `item.get` +
   `history.get` after one interval.
2. **Problem digests for chatops**: `problem.get` with
   `severities: [4,5]`, `output: [...]`, `sortfield: eventid` — 5-minute cron →
   webhook fan-out (complements the media-type webhook, see
   [Actions & Alerting](actions-and-alerting.md)).
3. **Config drift audit**: `configuration.export` → diff in CI; or targeted
   `item.get` vs template values.
4. **Cleanup jobs**: find disabled items older than N (`filter.status:1`,
   `search` on lastlogsize==0...) — delete via `item.delete` after review.

## Performance & Robustness

- Prefer narrow `output` + `filter` over `select*` chains; nested `select*` on
  big hosts is the classic API timeout cause.
- Batch writes: `host.create` accepts arrays; one call per 100 hosts beats 100
  calls of 1 host.
- Handle JSON-RPC errors explicitly: response `error.code/-32000` messages
  carry the reason (`E_NOTFOUND`, permission denied, `ZBX_API_ERROR_PARAMETERS`).
- Watch DB load: API queries hit the same database as the server's history
  writers — bulk reports belong off-hours, or on a replica (see
  [Proxies & Scale](proxies-and-scale.md)).
- Log every call with its `id` and params in automation; the frontend's Audit
  log does not show API writes with business context.

## Common Pitfalls

1. `"output": "extend"` everywhere → slow queries and bloated payloads.
2. Comparing strings to numeric enums (`"status": "0"` works inconsistently —
   use integers).
3. Storing passwords in scripts instead of API tokens + secret macros.
4. `deleteMissing: true` on import — mass deletion surprise; always review the
   rules block.
5. Building dashboards off `event.get` history instead of `problem.get` —
   events include resolved; problems are what's on fire **now**.
