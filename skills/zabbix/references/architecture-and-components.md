# Architecture & Components

## Component Map

```text
                    ┌──────────────┐
  agents ──────────▶│              │        ┌──────────┐
  SNMP/IPMI/JMX ───▶│ zabbix_server│◀──────▶│ database │
  HTTP/trapper ────▶│  (HA pair)   │        └──────────┘
                    │              │
  zabbix_proxy ─────▶   frontend ◀── users / API clients
                    └──────────────┘
```

| Component | Role |
|-----------|------|
| `zabbix_server` | Core daemon: polls, receives trapper data, evaluates triggers, runs escalations, writes to DB |
| `zabbix_proxy` | Optional data collector for remote/DMZ sites; buffers and forwards to server |
| `zabbix_agent` / `zabbix_agent2` | Host-side collector; agent2 (Go) is the modern one — same keys plus a plugin architecture |
| Web frontend | PHP app for configuration, maps, dashboards, and the JSON-RPC endpoint |
| Database | MySQL/PostgreSQL (+TimescaleDB recommended at scale); stores config, history, trends, events |

The server never talks "through" the frontend — the frontend is stateless against
the same DB, and the API is served by the frontend (`api_jsonrpc.php`).

## Agents: Passive vs Active

| Mode | Initiated by | Config knob | Use for |
|------|--------------|-------------|---------|
| Passive (ZABBIX_PASSIVE items) | server/proxy → agent:10050 | `Server=<server IPs>` | Server-side reachability, exact control of polling |
| Active (ZABBIX_ACTIVE items) | agent → server/proxy:10051 | `ServerActive=<server>` | DMZ/NAT'd hosts, bulk collection, less server load per check |

- Active agents fetch their item list on `RefreshActiveChecks` (default 120s) and
  buffer unsent values locally.
- Both modes can run simultaneously on one agent; keys differ per item type, not
  per agent.
- `agent2` adds plugins (Docker, PostgreSQL, MySQL, MQTT, Modbus...) and
  composable `Plugins.*` config; it honors the same `UserParameter` mechanism.
- Agent availability per interface is exposed as `zabbix[host,agents_available]`-style
  internal metrics; the canonical "agent down" trigger is `nodata()` on `agent.ping`
  (see [Triggers & Events](triggers-and-events.md)).

## Server High Availability (6.0+)

- Run two or more `zabbix_server` instances against the same DB with
  `HANodeName` and `NodeAddress` set; they elect an active node automatically.
- Runtime control: `zabbix_server -R ha_status`, `-R ha_standby`,
  `-R ha_remove=name`.
- Proxies and frontends learn both node addresses; failover is automatic with a
  configurable delay (`HAFailoverDelay`).
- Requirements: both nodes share the same DB, same config sync; watch for
  split-brain symptoms in `ha node` diagnostics when DB latency is high.

## Server Processes (What the `zabbix[process,*]` Metrics Mean)

| Process family | Job |
|----------------|-----|
| `poller` / `unreachable poller` | Passive checks; unreachable pollers handle hosts that failed before |
| `trapper` | Receives active-agent, trapper-item, and proxy-sender data on 10051 |
| `preprocessing workers` | Run item preprocessing pipelines (regex, JSONPath, JS...) |
| `escalator` | Advances action escalation steps (see [Actions & Alerting](actions-and-alerting.md)) |
| `alert manager` / `alerter` | Deliver notifications through media types |
| `discoverer`, `pingers`, `http pollers`, `java pollers`, `snmp trappers`, `vmware collectors` | Specialized collectors |
| `history syncers` / `trend syncers` | Flush value caches into history/trend tables |
| `configuration syncers` | Load config changes from DB into the config cache |
| `housekeeper` | Deletes expired history/events (see [Proxies & Scale](proxies-and-scale.md)) |

Every process family has a `Start<Name>` knob in `zabbix_server.conf`; starvation
shows up as the classic `zabbix[process,poller,avg,busy]`-style internal items
crossing 90%+ — scale `StartPollers` and friends before adding hosts.

## Config Essentials (`zabbix_server.conf`)

```ini
DBHost=127.0.0.1
DBName=zabbix
DBUser=zabbix
DBPassword=...

CacheSize=1G            # config cache — grows with hosts/items/templates
HistoryCacheSize=512M   # incoming value buffer before history syncers flush
TrendCacheSize=256M     # trend computation buffer
ValueCacheSize=1G       # trigger/LLD evaluation cache — size by monitored value rate

StartPollers=25
StartTrappers=20
StartPreprocessors=15   # keep >0 — preprocessing queues otherwise
StartEscalators=2
Timeout=10              # keep aligned with agent Timeout and network reality

HANodeName=zbx-server-a # HA (6.0+)
NodeAddress=zbx-a.example.com:10051
```

Environment-variable secrets are not natively supported in the conf file — keep
DB credentials out of world-readable files (`chmod 600`, dedicated filesystem
perms) or inject via systemd `EnvironmentFile`.

## Data Flow & Storage

1. Value arrives (poller result, trapper packet, proxy send).
2. Preprocessing pipeline runs (fails mark the value with an error state).
3. Value lands in the history cache → `history syncers` write to `history*` tables.
4. Trigger evaluation reads through the value cache; state changes create events.
5. Escalator evaluates open problems against actions each `escalation period`.

Retention: `history` (raw) and `trends` (hourly aggregates) are set per item —
short history + long trends is the standard economy. TimescaleDB compresses both
(see [Proxies & Scale](proxies-and-scale.md)).

## Ports & Topology Notes

| Port | Service |
|------|---------|
| 10050/tcp | agent passive |
| 10051/tcp | trapper (active agents, proxies, `zabbix_sender`) |
| 10052/tcp | Java gateway (JMX) |
| 80/443 | frontend + `api_jsonrpc.php` |

Firewall stance: agents in DMZs only ever need outbound to the proxy/server
(active mode); avoid exposing passive agent ports to untrusted networks. TLS via
PSK or certificates for every server↔agent/proxy leg — see
[Proxies & Scale](proxies-and-scale.md).
