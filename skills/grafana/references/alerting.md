# Alerting

Grafana Unified Alerting (introduced in 8.0, default since 9.0) evaluates rules
server-side on a schedule, routes firing alerts through a **notification policy
tree** to **contact points**, independent of any dashboard or panel.

## Rule Types

| Type | Where it evaluates | Use for |
|------|--------------------|---------|
| **Grafana-managed** | Grafana's own scheduler, expression engine | Multi-source rules (e.g. Prometheus + SQL in one rule), transformations between queries, complex expression chains |
| **Datasource-managed** | The data source's ruler (Mimir, Loki) | Scales better for thousands of rules; evaluated in the storage layer, no Grafana expressions |

Choose datasource-managed when the rule is a single Prometheus/Loki expression and
volume is large; choose Grafana-managed for anything combining sources or needing
expression queries.

## Grafana-Managed Rule Anatomy

A rule is a **query chain** — data source queries + expression queries, joined by
`refId` letters:

```text
A  (Prometheus)  expr: 100 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100
B  (Expression)  type: reduce, reducer: lastNotNull, reducerValue: A
C  (Expression)  type: threshold, condition: gt 90
        condition: C        ← final refId decides alert state
```

Expression types:

| Type | Purpose |
|------|---------|
| `reduce` | Collapse a range query to a single number per series (`lastNotNull`, `mean`, `max`...) |
| `threshold` | Compare to bounds (`gt`, `lt`, `outside_range`, `within_range`) |
| `math` | Free-form math over other refIds (`$A > 90 && $B < 5`, `no-op` passthrough) |
| `classic_conditions` | Legacy per-series AND/OR conditions (pre-9 rules) |
| `range` | Inside/outside a band for a duration |

## State Machine

```text
Normal ──(condition true)──▶ Pending ──(for elapsed)──▶ Alerting
   ▲                            │                          │
   └──(condition false)─────────┴──(still firing)──────────┘
```

| Setting | Effect |
|---------|--------|
| `for` (pending period) | Condition must stay true this long before `Alerting` — kills flapping; set ≥ 2× evaluation interval |
| `keep_firing_for` | After condition clears, keep firing this long — prevents notification storms from flapping counters |
| NoData behavior | `NoData` state can be treated as `Alerting` / `OK` / `Keep Last State` — pick per rule; **Alerting on NoData only where silence means breakage** (e.g. target up), otherwise you alert on query failures |
| Error behavior | Same choice for execution errors (`Error` state) |

Labels & annotations: annotations support templates
(`{{ $labels.instance }}`, `{{ $value }}`); add `runbook_url`, `severity`,
`team` labels here — the notification policy routes on them.

## Notification Policy Tree

One root policy, optional nested policies. Each alert walks the tree from the
root; matching is by **label matchers**; every branch **inherits** unless it sets
`continue` behavior. First match that doesn't continue wins.

```yaml
policies:
  - orgIdentifier: 1
    receiver: default-slack
    group_by: [grafana_folder, alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
    policies:                                  # nested branch
      - receiver: paging
        matcher_severity: "equals critical"    # label matcher
        group_wait: 0s
        repeat_interval: 30m
```

Timing semantics (inherited from Alertmanager):

| Field | Meaning |
|-------|---------|
| `group_by` | Alerts with equal values of these labels batch into one notification (`["..."]` empty = everything, `["..."]` include `grafana_folder` to keep folders together) |
| `group_wait` | Delay before sending the first notification — lets friends arrive into the same batch |
| `group_interval` | Minimum gap between notifications for the same group |
| `repeat_interval` | Re-notify cadence for an unresolved group |
| `mute_timings` | Windows where notifications are suppressed (maintenance); alerts still fire — only notifications stop |

Effective defaults to copy: `group_wait: 30s`, `group_interval: 5m`,
`repeat_interval: 4h`; paging branches: `group_wait: 0s`,
`repeat_interval: 30m`.

## Contact Points

A contact point bundles one or more receivers; reference them by name from
policies. Common receiver types: Slack, Email, PagerDuty, OpsGenie, Webhook,
Microsoft Teams, Telegram, VictorOps, OnCall, Kafka.

- Webhook receivers are the integration point for custom pipelines (n8n, bots,
  SMS gateways) — the payload is JSON with `alerts[]`, `status`, `labels`,
  `annotations`, `state`, `fingerprint` (see
  [provisioning-alerting.yaml](../examples/provisioning-alerting.yaml)).
- Use integration keys (PagerDuty/Slack apps) from a secrets store, injected via
  `${__env{...}}` — never in the YAML itself.
- Test deliveries with "Send test notification" — it sends a synthetic payload,
  but **bypasses the policy tree** (sent directly to the chosen contact point);
  verify routing with a real firing rule or the "Notify" preview in the policy UI.

## Silences & Maintenance

- **Silences** — time-boxed matcher-based suppression (alertmanager-compatible
  matching: `severity=~"warning|info"`); created in UI/API
  (`POST /api/alertmanager/grafana/api/v2/silences`).
- **Mute timings** — recurring windows in the policy tree (weekends, deploy
  windows); provisioned under `muteTimings`.
- Prefer silences for one-off incidents; mute timings for recurring patterns.

## Evaluating at Scale

- Rule **groups** evaluate on one schedule (`interval`) — group size/cadence
  drives scheduler load; split by cadence and importance.
- Grafana-managed rules are evaluated by one instance per group (HA via shared
  DB/Redis) — see [Architecture & Concepts](architecture-and-concepts.md).
- For >10k datasource-managed rules, deploy a dedicated **Mimir/Loki ruler** and
  keep Grafana-managed rules for cross-source exceptions.
- Watch `/metrics`: `grafana_alerting_rule_evaluations_total`,
  `grafana_alerting_execution_errors_total`, evaluation duration histograms.

## Provisioning & APIs

- Files under `provisioning/alerting/` (see [Provisioning](provisioning.md)) or
  Terraform resources (`grafana_rule_group`, `grafana_contact_point`,
  `grafana_notification_policy`).
- Admin APIs: `/api/v1/provisioning/alert-rules`, `.../contact-points`,
  `.../notification-policies` — objects get `provenance: api|file`; file-provisioned
  objects are read-only via API.
- Ruler API for datasource-managed rules: `/api/ruler/{datasource_uid}/api/v1/rules/...`.

## Common Pitfalls

1. Testing a query in Explore and pasting it into a rule — Explore returns
   already-reduced results; a rule query must return **ranges** and let a
   `reduce` expression do the collapse.
2. `condition` pointing at the wrong `refId` — the alert evaluates the *final*
   query only; a threshold at `C` with no `condition: C` set evaluates `A`.
3. NoData → Alerting by default habit: a bad query or dead datasource becomes a
   page at 3am; choose NoData behavior consciously per rule.
4. Root policy receiver empty/unset — alerts fire but nobody is notified; every
   tree needs a root receiver.
5. `group_interval` < `group_wait` — groups never settle; keep
   `group_interval ≥ group_wait`.
6. Forgetting `keep_firing_for` on rate-based counters — brief scrape gaps
   resolve/re-alert repeatedly.

See [Provisioning](provisioning.md) for file mechanics,
[Best Practices](best-practices.md) for tuning, and
[provisioning-alerting.yaml](../examples/provisioning-alerting.yaml) for a full
working setup.
