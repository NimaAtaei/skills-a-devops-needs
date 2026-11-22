# Triggers & Events

A trigger evaluates item values continuously and flips between `OK` and
`PROBLEM`; state changes create **events** that feed actions. The 5.4+ expression
syntax is `function(/host/key,<parameters>)` — no more `{host:key.func()}` braces.

## Expression Building Blocks

| Function | Meaning | Example |
|----------|---------|---------|
| `last(/h/key)` | Newest value; `last(/h/key,#3)` = 3rd-newest | `last(/host/vfs.fs.size[/,pused])>90` |
| `avg(/h/key,5m)` | Average over window; `#N` = last N values | `avg(/host/system.cpu.util,5m)>85` |
| `min(/h/key,10m)` / `max(...)` | Window extremes | `max(/host/net.if.in[eth0],10m)>1G` |
| `sum(/h/key,1h)` | Window sum | `sum(/host/custom.errors,1h)>100` |
| `count(/h/key,5m)` | Values matching criteria in window | `count(/host/agent.ping,10m,,"0")>0` |
| `nodata(/h/key,5m)` | 1 if no data in period | `nodata(/host/agent.ping,3m)=1` |
| `change(/h/key)` | last − previous | `abs(change(/host/custom.file.hash))>0` |
| `diff(/h/key)` | 1 if value changed (string) | `diff(/host/custom.config.md5)=1` |
| `time()`, `date()`, `dayofweek()` | Wall-clock predicates | maintenance-like logic inside expressions |
| `forecast()`, `timeleft()` | Trend extrapolation | `timeleft(/host/vfs.fs.size[/,used],30m,90%)<86400` |
| `logeventid()`, `logseverity()`, `ircregexp()` family | Log-item predicates | Windows event log triggers |

Operators: `> >= < <= = <>`, boolean `and or not`, string `= <>`; arithmetic and
unit suffixes (`1G`, `300s`, `90%`) are valid inside function parameters.

Trigger severity ladder: Not classified → Information → Warning → Average →
High → Disaster. Severities drive media routing and colors; be consistent
(see [Best Practices](best-practices.md)).

## Canonical Trigger Patterns

```text
# Resource saturation
last(/host/vfs.fs.size[/,pused])>90

# Sustained load (avoids blips)
avg(/host/system.cpu.load.all,5m)>8

# Agent/collector death — the only reliable "down" trigger
nodata(/host/agent.ping,3m)=1

# Flap suppression: state must persist
last(/host/system.swap.size[,pfree])<10 for 5m

# Threshold crossing within window (burst then recover)
max(/host/net.tcp.service[https],10m)=0

# Multi-condition
last(/host/system.cpu.util)>90 and last(/host/vm.memory.size[,available])<10%

# Predictive capacity
timeleft(/host/vfs.fs.size[/,used],1h,95%)<86400
```

The `for 5m` clause (problem must stay true that long before flipping) is the
built-in flap killer — prefer it over `avg()`-only smoothing when the semantics
are "state, not rate".

## Dependencies

- A trigger **depends on** another: while the parent is in PROBLEM, the child
  stays suppressed (notifications skipped, problem shown as dependent).
- Canonical chain: `host unreachable` ← every service trigger on that host.
- Template-level dependencies between templates need consistent host linkage;
  broken dependencies silently disable the child.
- Do not model dependencies through `and`/`or` in expressions when you actually
  want suppression — use dependencies; they also shape the problem tree.

## Events & Problems

- **Event** = any state change (PROBLEM, RESOLVED, plus discovery/internal/
  auto-registration events). **Problem** = currently-unresolved trigger event.
- Multiple-problem generation: a trigger can produce a new problem while
  unresolved if configured (`Multiple problem event generation`) — used for
  count-based alarms; otherwise default to one open problem per trigger.
- **Correlation** closes a problem when a matching event arrives:
  - per-trigger correlation (`OK event closes` + correlation tag) — safe,
    scoped to the trigger;
  - **global correlation** — powerful and dangerous: a too-wide global rule
    closes unrelated problems. Require a unique correlation tag (e.g.
    `{EVENT.ID}`-scoped or entity id) and audit global rules before enabling.
- **Acknowledge** — operators annotate events (message, change severity, close,
  re-notify). Acknowledgement state is queryable via API `problem.get`
  (`acknowledged` field) and drives NOC workflows (see [API](api.md)).

## Tags — The Modern Routing Key

Triggers carry **tags** (`severity`, `team`, `env`, `component`) that:

1. Route actions (conditions match tags — see
   [Actions & Alerting](actions-and-alerting.md));
2. Map services/SLA trees (service actions match tags);
3. Correlate events and aggregate problems in maps/topology.

Rule of thumb: every template trigger ships with at least `team` and
`severity` tags, and any entity id needed for correlation. Names are
lowercase, stable, and template-consistent.

## Event Names & Macros

- Trigger `name` is the problem title — make it human and actionable:
  `Disk usage on {#FSNAME} is high (>90% used: {ITEM.LASTVALUE1})`.
- `OPDATA` (operational data) carries extra short values for NOC screens.
- Keep `{ITEM.LASTVALUE1}`-style substitution out of severity-critical matching —
  route on **tags**, not on message text.

## Services (SLA)

- Service trees model business views: `CDN Service → Origin ↔ Edge` with
  status-propagation rules and child-weight algorithms (6.0 reworked services:
  status rules, advanced propagation, tags-based child matching).
- Trigger→service mapping is via tags; SLA reports compute availability over
  configured periods.
- Keep service trees shallow (2–3 levels) and let tags do the mapping — deep
  trees become unmanageable and hide root causes.

## Common Pitfalls

1. `nodata` triggers on items whose collection legitimately pauses (maintenance
   with "pause monitoring") — pair maintenance with suppressed actions.
2. Counting flaps: without `for`/dependencies, a bouncing threshold pages
   repeatedly — set dependencies + persistence.
3. Global correlation enabled to "deduplicate" — closes real incidents;
   prefer per-trigger correlation tags.
4. Trigger on `last()` of a counter instead of `rate`-style preprocessing
   (`change()`/`speed per second`) — counters reset and produce false spikes.
5. Hardcoded host names inside template triggers — always `/host/key` of the
   templated host, never a literal foreign host.
