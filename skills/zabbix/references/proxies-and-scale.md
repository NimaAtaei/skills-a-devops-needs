# Proxies & Scale

Proxies decouple collection from the server: remote sites, DMZs, and load
spreading. Scale planning is mostly about **value rate** and **database**.

## Proxy Modes

| Mode | Flow | Config |
|------|------|--------|
| **Active** (default) | proxy connects to server, fetches config, pushes data | proxy: `ServerActive=<server:10051>`, `Hostname=` exact proxy name |
| Passive | server polls the proxy on 10051 | proxy: `Server=<server IPs>`; server-side proxy `Mode=passive` |

Prefer active: NAT/DMZ-friendly, survives inbound firewall changes, one less
polling burden on the server.

`zabbix_proxy.conf` essentials:

```ini
ProxyMode=0               # 0 = active, 1 = passive
ServerActive=zbx.example.com:10051
Hostname=proxy-dc2        # must match the proxy object name exactly

ProxyBufferMode=hybrid    # 7.0+: memory/hybrid/disk — fast collection with crash safety
ProxyMemoryBufferSize=128M

ConfigFrequency=300       # active: config fetch cadence
DataSenderFrequency=5     # active: data push cadence (seconds)

ProxyLocalBuffer=0        # hours to keep data already sent (debugging)
ProxyOfflineBuffer=24     # hours to survive server outage — size by link reality

TLSConnect=psk            # or tls psk identity/file pair for active connections
TLSPSKIdentity=proxy-dc2-psk
TLSPSKFile=/etc/zabbix/proxy.psk
```

Proxy **high availability / load balancing** (7.0+): proxy groups — the server
balances collectors across online proxies of a group and moves hosts on
failure; hosts are assigned to the group instead of one proxy. Design sites as
groups when any box can reach any proxy.

## Sizing: The Value Rate Model

Everything scales with **NVPS** (new values per second):

```text
NVPS ≈ Σ (items × 1/interval)
```

- 5000 hosts × ~150 enabled items at ~1m average ≈ 12.5k NVPS — comfortable on
  a 4–8 vCPU server with TimescaleDB.
- Poller starvation signs: `zabbix[process,poller,avg,busy]` > 90%, growing
  `zabbix[queue,...]`, delayed `lastcheck`. Fix order: reduce item intervals →
  convert passive to active → add pollers → add proxy/spread.
- Unreachable storm: one flaky host exhausts **unreachable pollers** and
  delays unrelated hosts — keep `StartUnreachablePollers` proportional and fix
  the noisy host.
- `CacheSize` (config) must hold the whole monitored config; symptoms of a too
  small config cache are slow frontend queries and `cache fill` warnings in
  server log. `HistoryCacheSize`/`ValueCacheSize` drive write+trigger speed.

## Database

- **TimescaleDB** (PostgreSQL) for any serious size: hypertables on history/
  trends + native compression (typically 10×+ space win). With compression on,
  set `HousekeepingFrequency=0` (disable housekeeper on compressed chunks) and
  manage retention via compression policy.
- Without TimescaleDB: partition history/trends tables (pg_partman/native) —
  the housekeeper deleting row-by-row cannot keep up at scale
  (`MaxHousekeeperDelete` caps its work per cycle).
- Trend-vs-history economics: raw history dominates DB size; shorten history,
  keep trends long (aggregates are tiny).
- Server and frontend share DB latency: keep DB on local NVMe or same-LAN;
  replication for reporting reads, not for the server's own writes.

## Queue & Health Monitoring (Monitor the Monitor)

Internal items on the `Zabbix server` host:

| Item | Reads |
|------|-------|
| `zabbix[queue,10m]` | Values delayed >10m — the "collection is falling behind" alarm |
| `zabbix[process,poller,avg,busy]` (+ each family) | Process saturation |
| `zabbix[rcache,buffer,pfree]`, `zabbix[wcache,values]` | Cache pressure & write rate |
| `zabbix[history]`, `zabbix[trends]`, `zabbix[items]` | Stored counts — drift detection |
| `zabbix[ha,<state>]`-style / ha status runtime | HA node health (6.0+) |

Template these once for every server/proxy; the NOC must see monitoring health
degrade **before** users do.

## TLS & Security

- Encrypt every leg: `TLSConnect`/`TLSAccept` = PSK or certificate on agents
  and proxies; PSK is operationally easiest (identity + pre-shared file).
- PSK minimum 128-bit, generated (`openssl rand -hex 32`), file mode 600.
- Frontend: TLS at LB, SSO, MFA; API tokens with expiry (see [API](api.md)).
- Restrict 10050/10051 exposure — agents should be passive-reachable **only**
  from proxies/servers; active mode keeps DMZ agents outbound-only.

## Upgrade Path & Version Skew

- LTS→LTS is the supported steady path (7.0 LTS → 8.0 LTS); read the upgrade
  notes for renamed config parameters and removed platforms.
- Order: DB backup → server (one node at a time with HA) → proxies → agents.
- Version skew rule: proxies must not be **newer** than the server; agents
  tolerate wider skew but upgrade them with OS updates.
- After upgrade: verify `zabbix[queue]`, housekeeper logs, proxy buffer mode
  still configured, and frontend schema sync completed.

## Common Pitfalls

1. `Hostname` on active proxy/agent not matching exactly — data arrives but
   never lands on the right object.
2. Passive proxies behind NAT — server cannot reach them; use active mode.
3. Disk-mode proxy buffer on slow disks during outages — use hybrid (7.0+)
   and size `ProxyOfflineBuffer` to the worst link outage.
4. Enabling TimescaleDB without adjusting housekeeper — two retention systems
   fighting; disable housekeeper where compression manages retention.
5. Monitoring hundreds of hosts through one small proxy — the proxy has the
   same NVPS limits; monitor the proxy with the internal metrics above.
