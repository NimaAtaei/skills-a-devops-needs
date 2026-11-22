# Items & Data Collection

An **item** is a single metric definition: key + type + fetch interval +
preprocessing + retention. Everything else (triggers, graphs, LLD, actions)
hangs off items.

## Item Key Syntax

```text
key                          # no parameters
key[param]                   # one parameter
key[param1,"quoted, param",utf8.param]
```

- Unquoted parameters cannot contain `]` or `,`; quoted parameters follow
  C-style escaping (`\"`).
- `UserParameter` commands receive parameters as `$1`…`$9`; `$$` inside the
  command escapes shell substitution expectations.
- Keys are unique per host; visible names are what humans read — always set a
  readable `name` (e.g. key `system.cpu.util[,idle]` → name "CPU idle time (%)").

## Item Types (Which One and Why)

| Type | Fetches via | Typical use |
|------|-------------|-------------|
| ZABBIX_PASSIVE | server/proxy → agent | Standard LAN hosts |
| ZABBIX_ACTIVE | agent → server/proxy | DMZ/NAT, thousands of hosts, less poller load |
| TRAPPER | `zabbix_sender` → 10051 | Push-style pipelines, scripts, external collectors |
| SNMP_AGENT | v1/v2c/v3 polls | Network gear; use LLD + dynamic indexes |
| HTTP_AGENT | server-side HTTP GET/POST | REST endpoints (pair with dependent items) |
| DEPENDENT | preprocessing of master item | Split one payload into many metrics — the #1 poll-count reducer |
| CALCULATED | server-side formula | Ratios/derivations, e.g. disk percent from two raw items |
| SCRIPT | server-side JavaScript (5.4+) | Controlled outbound calls without agent involvement |
| ODBC / DATABASE MONITOR | SQL query | DB health dashboards (read-only users!) |
| JMX / IPMI / SSH / TELNET / EXTERNAL | specialty protocols | Legacy gear; prefer EXTERNAL scripts over SSH where possible |

## Preprocessing Pipeline

Steps run in order, server-side (on proxy for proxies' collected data), before
storage and trigger evaluation:

| Step | Purpose |
|------|---------|
| Custom multiplier | Unit scaling (`*100`, `*0.001`) |
| Regular expression | Extract pattern from raw output (`\s+(\d+)%` → group) |
| Trim / Replace / RTRIM / LTRIM | Normalize strings |
| JSONPath / XPath | Pull fields from JSON/XML payloads |
| Discard unchanged | Drop identical values (huge DB saver for gauges) |
| Discard unchanged with heartbeat | Same, but force a value every N seconds (keeps `nodata` honest) |
| Delta / Speed per second | Counter handling for gauges that arrive as counters |
| JavaScript | Arbitrary transform (5.4+ sandboxed JS) |
| Prometheus pattern / check for JSON error | Specialized validation/extraction |

Error handling per step: **discard value**, **keep value**, or **set custom
value** — a pipeline that can error should say what to do, or you get silent
gaps.

Canonical pattern — one HTTP call, many metrics:

```text
master: HTTP_AGENT  → https://app.example.com/metrics.json   delay 1m
  dependent: JSONPath `$.workers.busy`     → app.workers.busy
  dependent: JSONPath `$.workers.idle`     → app.workers.idle
  dependent: JSONPath `$.queue.depth`      → app.queue.depth
```

## Low-Level Discovery (LLD)

- Discovery rules emit `{#MACRO}` sets (e.g. `{#FSNAME}`, `{#IFNAME}`); item and
  trigger **prototypes** instantiate real objects per discovered entity.
- Built-ins: `vfs.fs.discovery`, `net.if.discovery`, `system.hw.discovery`...
  Custom discovery: return JSON `{"data":[{"{#PORT}":"8080"}]}` from any item
  type (agent script, HTTP, trapper).
- **Overrides** — per-discovered-instance adjustments: change interval/history
  for matching `{#FSNAME}` values without cloning prototypes.
- **Filters** keep discovery sane (`{#FSTYPE}` matches `ext4|xfs|ntfs`) —
  without filters you collect `/proc`, `/sys`, and snapshot volumes forever.
- `Keep lost resources period` controls cleanup of vanished entities; pair with
  `Delete lost resources` consciously (deleting breaks graphs, keeping bloats).

## User Parameters

```ini
# /etc/zabbix/zabbix_agentd.d/custom.conf  (Include= in main conf)
UserParameter=custom.health.services,systemctl is-active nginx redis postgres | tr '\n' ','
UserParameter=custom.proc.count[*],pgrep -fc "$1" || true
UserParameter=custom.win.service[*],powershell -NoProfile -Command "(Get-Service -Name $1).Status"
```

- `[*]` enables parameters; sanitize/quote every `$N` (command injection via
  macro expansion is a real risk with untrusted names).
- `UnsafeUserParameters=1` permits `#`/spaces in args — avoid unless needed.
- For heavy or repeated logic prefer agent2 plugins or an EXTERNAL script over
  long-running `UserParameter` commands — each passive check occupies a poller
  for its whole runtime; set agent `Timeout` accordingly.

## Trapper Items & `zabbix_sender`

```bash
zabbix_sender -z zbx-proxy.example.com -s "web-01" -k custom.queue.depth -o 42
# batch from a file for bulk pipelines:
zabbix_sender -z zbx.example.com -i values.txt   # host key value per line
```

- Restrict trapper sources with the item's **Allowed hosts** list; unauthenticated
  pushes to 10051 are otherwise accepted.
- Trapper + LLD JSON is the standard bridge from bespoke collectors into Zabbix.

## Retention & Intervals

- `History` (raw values) and `Trends` (hourly min/avg/max) retention are per
  item: e.g. history `7d`, trends `365d` for numeric items; strings/logs have no
  trends.
- Flexible/scheduling intervals: quiet hours, business-hours-only polling —
  cheaper than collecting and ignoring.
- Do not poll every second "just in case": value rate is the whole cost model of
  the server (see [Proxies & Scale](proxies-and-scale.md)).

## Inventory & Unit Discipline

- Set `Units` (`%`, `B`, `bps`) — units drive nice formatting and unit
  conversion; unset units make graphs lie.
- Fill inventory fields (`OS`, `Location`) at host creation — maps and reports
  depend on them; automate via API (see [API](api.md)).
