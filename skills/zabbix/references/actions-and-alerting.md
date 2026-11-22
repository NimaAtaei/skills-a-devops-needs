# Actions & Alerting

**Actions** turn events into notifications and automation: conditions select
events, operations fire in an escalation ladder, media types deliver.

## Action Anatomy

| Part | Role |
|------|------|
| Event source | TRIGGERS, DISCOVERY, AUTO_REGISTRATION, INTERNAL |
| Filter/conditions | Which events: host group, tag (`severity=critical`), template, host, maintenance status |
| Operations | Notification / remote-ish actions per escalation step |
| Update operations | What happens on resolution/acknowledge (notify resolver, close ticket hook) |

Design rule: route by **tags**, not by message text — conditions matching
`severity` and `team` tags stay stable while trigger wording evolves (see
[Triggers & Events](triggers-and-events.md)).

## Escalation Chains

Escalation steps repeat while a problem stays unresolved:

```text
step 0 (at problem)      → notify on-call NOC (high+ severity)
step 1 (+1h, still open) → notify NOC lead + reopen ticket
step 2 (+3h)             → notify manager + SMS gateway
```

- `Default operation period` (default 1h) defines one step's duration; each
  operation declares `start step`/`end step` (same number = fire once at that
  step).
- If the problem resolves, remaining steps are skipped (and "update operations"
  send the recovery message — configure a **recovery notification** so teams
  learn it is over).
- `Pause operations for suppressed periods` keeps maintenance windows from
  burning escalation steps; `Notify all involved` re-pings previous recipients
  when things worsen.
- A full escalation ladder as YAML export:
  [escalation-action.yaml](../examples/escalation-action.yaml).

## Operations Available

- **Send message** — to user/group, via one or all media types (respecting
  media `active periods` and per-user severity floors).
- **Run script** — since 6.0, remote command operations are gone; automation
  runs through configured **scripts** (frontend/API, agent/server scopes) that
  can also be invoked manually — design runbooks as scripts, wire them to
  problems, and let humans trigger them (safer than auto-remediation).
- **Add host / update host / link template** — discovery and auto-registration
  actions only.
- Update operations: acknowledge hooks — e.g. "on acknowledge, forward to n8n
  to create/update a ticket".

## Media Types

| Type | Notes |
|------|-------|
| Email (SMTP) | Auth + TLS; per-user destination; message templates per event type |
| SMS | Serial modem on server — rare; prefer webhook→SMS gateway |
| Script | Server-side script execution (custom notifier binaries) |
| **Webhook** | JavaScript (5.4+): the integration point for n8n, ticket systems, chat bots, SMS gateways |

### Webhook Media Type Essentials

- The script receives `value` (JSON of the event/message) and `params` (the
  media type's parameter fields — URLs, secrets, severity maps).
- Globals: `HttpRequest` (post/get with headers, `getStatus()`), `Zabbix.log`,
  `Log` for debug; failed delivery shows in frontend and respects **retries**
  (`Attempts`, `Attempts interval`) — set retries ≥2 with sensible backoff.
- Secrets (webhook URLs, tokens) belong in **secret macros** or the media
  type's password fields — never inline in JS.
- Full working example forwarding problems to an n8n workflow:
  [webhook-mediatype-n8n.js](../examples/webhook-mediatype-n8n.js).

### Message Templates

Every media type defines **message templates per event source/severity**
(problem, recovery, update, discovery...). Default templates are terse —
improve them once, centrally:

```text
Subject: [{EVENT.SEVERITY}] {EVENT.NAME} on {HOST.NAME}
Body:
  Started: {EVENT.AGE} (duration {EVENT.DURATION})
  Values:  {ITEM.NAME1} = {ITEM.VALUE1}
  Tags:    {EVENT.TAGSJSON}
  Status:  {EVENT.STATUS} ({EVENT.UPDATE.STATUS})
```

## Discovery & Auto-Registration Actions

- **Discovery actions**: on discovered device/service → add host, link
  templates, set host group by condition (SNMP sysObjectID, OS fingerprint).
- **Auto-registration**: active agents announcing metadata → create host with
  PSK enforced (the metadata item is attacker-controlled text — treat it as
  untrusted input; never link admin-capable templates unconditionally).
- Guardrails: narrow conditions (host group allow-lists, metadata regex), and a
  quarantine host group for unknowns instead of immediate full onboarding.

## NOC Integration Patterns

1. **n8n / chatops hub**: single webhook media type forwards every critical
   problem → n8n fans out to SMS/Telegram/ticket systems and deduplicates.
2. **Ticket lifecycle**: acknowledge update-operation calls a webhook that
   attaches the ticket id to the event (`event.acknowledge` via API) —
   closing the loop both directions (see [API](api.md)).
3. **Escalation honesty**: an escalation step nobody answers is a lie —
   review who actually reacts to each step quarterly; delete dead steps.
4. **Recovery notifications always on** — teams need the "it's over" signal as
   much as the page.

## Common Pitfalls

1. Overlapping action conditions → double pages; one routing table, reviewed.
2. Media "active periods" forgotten → pager silent on weekends (or the
   opposite).
3. Webhook script throwing on transient 5xx without retries → lost pages;
   configure attempts and idempotent endpoints.
4. Escalation step 0 missing while step 2 exists — check your ladder actually
   starts where you think (`esc_step_from`).
5. Routing on trigger names/strings instead of tags — breaks on every rename.
