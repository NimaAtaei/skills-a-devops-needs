# Alerting & Alertmanager

## Alerting Rules (Prometheus Side)

Alerting rules are defined in rule files referenced by `rule_files` in `prometheus.yml`
and evaluated at the global `evaluation_interval`.

### Rule Group Structure

```yaml
groups:
  - name: service-alerts
    # Override global evaluation_interval for this group
    interval: 30s
    # Maximum number of alerts this group can produce (0 = unlimited)
    limit: 0
    rules:
      - alert: HighRequestLatency
        expr: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job)
          ) > 0.5
        for: 10m
        keep_firing_for: 5m
        labels:
          severity: critical
          team: backend
        annotations:
          summary: "High p99 latency on {{ $labels.job }}"
          description: "p99 latency is {{ $value | humanize }}s (threshold: 0.5s)"
          runbook_url: "https://wiki.example.com/runbook/high-latency"
          dashboard_url: "https://grafana.example.com/d/svc-latency?var-job={{ $labels.job }}"
```

### Alert Rule Fields

| Field | Required | Description |
|-------|----------|-------------|
| `alert` | ✅ | Alert name (must be a valid label value) |
| `expr` | ✅ | PromQL expression that triggers the alert when it returns results |
| `for` | ❌ | Duration the expression must be continuously true before transitioning from `Pending` → `Firing` |
| `keep_firing_for` | ❌ | Grace period — keeps alert `Firing` after expression ceases to trigger, preventing flapping |
| `labels` | ❌ | Additional labels attached to the alert (can override or add; used for routing in Alertmanager) |
| `annotations` | ❌ | Informational metadata (not used for routing; supports Go template syntax) |

### Alert States

| State | Meaning |
|-------|---------|
| `Inactive` | Expression evaluates to empty (no alert) |
| `Pending` | Expression matches but `for` duration not yet elapsed |
| `Firing` | Expression matched continuously for `for` duration; alert sent to Alertmanager |

### Template Variables in Annotations

| Variable | Description |
|----------|-------------|
| `{{ $labels }}` | Map of all alert labels |
| `{{ $labels.<name> }}` | Specific label value |
| `{{ $value }}` | The numeric expression result |
| `{{ $externalLabels }}` | Global `external_labels` from prometheus.yml |
| `{{ $externalLabels.<name> }}` | Specific external label value |

### Template Functions

| Function | Description | Example |
|----------|-------------|---------|
| `humanize` | Format number with SI units | `{{ $value \| humanize }}` → `1.5k` |
| `humanize1024` | Format with binary units | `{{ $value \| humanize1024 }}` → `1.5Mi` |
| `humanizeDuration` | Seconds → human duration | `{{ $value \| humanizeDuration }}` → `1m 30s` |
| `humanizePercentage` | Decimal ratio → percentage | `{{ $value \| humanizePercentage }}` → `95%` |
| `humanizeTimestamp` | Unix epoch → UTC string | `{{ $value \| humanizeTimestamp }}` |
| `title` | Title case | |
| `toUpper` / `toLower` | Case conversion | |
| `query` | Execute secondary PromQL query in template | `{{ query "up{job='api'}" }}` |

---

## Alertmanager Architecture

### Core Responsibilities

1. **Receives** alerts from one or more Prometheus servers via HTTP POST to `/api/v2/alerts`
2. **Deduplicates** identical alerts from redundant HA Prometheus servers
3. **Groups** related alerts into single notifications (prevents alert storms during outages)
4. **Routes** alerts through a routing tree to appropriate receivers based on label matchers
5. **Inhibits** certain alerts when other related alerts are already firing
6. **Silences** alerts temporarily based on label matchers (via UI or API)
7. **Dispatches** notifications to receivers (Slack, PagerDuty, email, webhook, etc.)

### High Availability

- Alertmanager instances form a **gossip mesh** using the memberlist protocol on port 9094
- Notification logs and silences are replicated across all cluster members
- No central leader — all instances can receive and process alerts
- Deduplication ensures only one notification per alert group despite multiple instances

```
# Launch HA Alertmanager cluster
alertmanager --cluster.peer=am-1:9094 --cluster.peer=am-2:9094
```

---

## Alertmanager Configuration (`alertmanager.yml`)

### Global Settings

```yaml
global:
  # How long to wait before marking an alert as resolved if Prometheus
  # stops sending it (default: 5m)
  resolve_timeout: 5m

  # --- SMTP defaults ---
  smtp_smarthost: 'smtp.example.com:587'
  smtp_from: 'alertmanager@example.com'
  smtp_auth_username: 'alerts'
  smtp_auth_password: 'secret'
  smtp_require_tls: true
  smtp_hello: 'alertmanager.example.com'

  # --- Default API URLs / Keys ---
  slack_api_url: 'https://hooks.slack.com/services/T.../B.../xxx'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'
  opsgenie_api_url: 'https://api.opsgenie.com/'
  opsgenie_api_key: 'xxxxxxxx'
  wechat_api_url: 'https://qyapi.weixin.qq.com/cgi-bin/'
  victorops_api_url: 'https://alert.victorops.com/integrations/generic/20131114/alert/'
  telegram_api_url: 'https://api.telegram.org'

  # --- HTTP client defaults ---
  http_config:
    follow_redirects: true
    enable_http2: true
```

### Routing Tree

The routing tree determines which receiver handles each alert. Alerts enter at the root
route and traverse child routes depth-first. The first matching child handles the alert
(unless `continue: true`).

```yaml
route:
  # Default receiver (required)
  receiver: default-slack

  # Labels used to group alerts into batches
  # ['...'] = aggregate by all labels (effectively disables grouping)
  group_by: ['alertname', 'cluster', 'service']

  # Time to wait before first notification for a new group
  group_wait: 30s

  # Time between notifications for an existing group when new alerts arrive
  group_interval: 5m

  # Minimum interval before resending a still-firing notification
  repeat_interval: 4h

  # Child routes (evaluated in order)
  routes:
    # Critical alerts → PagerDuty
    - matchers:
        - severity = critical
      receiver: pagerduty-critical
      group_wait: 10s
      repeat_interval: 1h
      routes:
        # Database critical alerts → DBA team
        - matchers:
            - service =~ "mysql|postgres|redis"
          receiver: pagerduty-dba

    # Warning alerts → Slack
    - matchers:
        - severity = warning
      receiver: slack-warnings
      repeat_interval: 12h

    # Info/watchdog alerts → null receiver (swallow)
    - matchers:
        - severity = info
      receiver: 'null'

    # Regex matching example
    - matchers:
        - team =~ "frontend|mobile"
      receiver: slack-frontend
      continue: true  # Also continue checking sibling routes

    # Time-based muting
    - matchers:
        - severity = warning
      mute_time_intervals:
        - weekends
        - maintenance-window
      receiver: slack-warnings
```

### Matcher Syntax

```yaml
matchers:
  - alertname = "HighLatency"          # Exact match
  - severity != "info"                 # Inequality
  - service =~ "api|web|gateway"       # Regex match
  - team !~ ".*-test"                  # Negative regex
```

### Time Intervals

```yaml
time_intervals:
  - name: weekends
    time_intervals:
      - weekdays: ['saturday', 'sunday']
  - name: business-hours
    time_intervals:
      - weekdays: ['monday:friday']
        times:
          - start_time: '09:00'
            end_time: '17:00'
        location: 'America/New_York'
  - name: maintenance-window
    time_intervals:
      - times:
          - start_time: '02:00'
            end_time: '04:00'
        weekdays: ['wednesday']
```

Use `mute_time_intervals` to silence during specified windows.
Use `active_time_intervals` to only send during specified windows.

### Inhibition Rules

Suppress alerts when a "source" alert is firing:

```yaml
inhibit_rules:
  # If the entire cluster is down, suppress individual node alerts
  - source_matchers:
      - alertname = ClusterDown
    target_matchers:
      - alertname = NodeDown
    equal: [cluster]

  # Critical alerts inhibit warnings for the same alertname
  - source_matchers:
      - severity = critical
    target_matchers:
      - severity = warning
    equal: [alertname, cluster]

  # Network-level alert inhibits application-level alerts
  - source_matchers:
      - alertname = NodeNetworkDown
    target_matchers:
      - alertname = InstanceDown
    equal: [node, instance]
```

### Receivers

```yaml
receivers:
  # Null receiver (swallows alerts)
  - name: 'null'

  # Slack
  - name: default-slack
    slack_configs:
      - channel: '#alerts'
        send_resolved: true
        title: '{{ .GroupLabels.alertname }} [{{ .Status | toUpper }}]'
        text: >-
          {{ range .Alerts }}
          *Alert:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Severity:* {{ .Labels.severity }}
          {{ end }}
        actions:
          - type: button
            text: 'Runbook :book:'
            url: '{{ (index .Alerts 0).Annotations.runbook_url }}'
          - type: button
            text: 'Dashboard :chart_with_upwards_trend:'
            url: '{{ (index .Alerts 0).Annotations.dashboard_url }}'

  # PagerDuty
  - name: pagerduty-critical
    pagerduty_configs:
      - routing_key: 'PAGERDUTY_INTEGRATION_KEY'
        severity: '{{ .GroupLabels.severity }}'
        client: 'Prometheus Alertmanager'
        client_url: '{{ template "pagerduty.default.clientURL" . }}'
        description: '{{ .GroupLabels.alertname }}: {{ .CommonAnnotations.summary }}'
        details:
          firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
          resolved: '{{ template "pagerduty.default.instances" .Alerts.Resolved }}'
          num_firing: '{{ .Alerts.Firing | len }}'
          num_resolved: '{{ .Alerts.Resolved | len }}'

  # Email
  - name: email-oncall
    email_configs:
      - to: 'oncall@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: 'alerts'
        auth_password: 'secret'
        send_resolved: true
        headers:
          Subject: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
        html: '{{ template "email.default.html" . }}'

  # Webhook (generic HTTP POST)
  - name: webhook-integration
    webhook_configs:
      - url: 'http://alert-handler:5001/alerts'
        send_resolved: true
        max_alerts: 0  # 0 = all alerts in group
        http_config:
          basic_auth:
            username: webhook-user
            password: secret

  # OpsGenie
  - name: opsgenie-platform
    opsgenie_configs:
      - api_key: 'OPSGENIE_API_KEY'
        message: '{{ .GroupLabels.alertname }}'
        priority: '{{ if eq .GroupLabels.severity "critical" }}P1{{ else }}P3{{ end }}'
        responders:
          - type: team
            name: platform-team
        tags: 'prometheus,{{ .GroupLabels.severity }}'
```

**Additional receiver types**: `pushover_configs`, `telegram_configs`, `discord_configs`,
`webex_configs`, `msteams_configs`, `jira_configs`, `victorops_configs`, `sns_configs`.

### Notification Template Data

Templates use Go `text/template` syntax. Available data structure:

| Field | Description |
|-------|-------------|
| `.Receiver` | Receiver name |
| `.Status` | `"firing"` or `"resolved"` |
| `.Alerts` | List of alert objects |
| `.Alerts.Firing` | Only firing alerts |
| `.Alerts.Resolved` | Only resolved alerts |
| `.GroupLabels` | Labels used for grouping |
| `.CommonLabels` | Labels common to ALL alerts in the group |
| `.CommonAnnotations` | Annotations common to ALL alerts |
| `.ExternalURL` | Alertmanager external URL |

Each alert object contains:

| Field | Description |
|-------|-------------|
| `.Labels` | All alert labels |
| `.Annotations` | All alert annotations |
| `.StartsAt` | Time alert started firing |
| `.EndsAt` | Time alert resolved (zero value if still firing) |
| `.GeneratorURL` | Link back to Prometheus expression that triggered the alert |
| `.Fingerprint` | Unique hash of alert's label set |

### Silences

Create via Alertmanager UI (`http://alertmanager:9093/#/silences`) or API:

```bash
# Create silence via API
curl -X POST http://alertmanager:9093/api/v2/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      {"name": "alertname", "value": "HighMemory", "isRegex": false},
      {"name": "instance", "value": "web-1:9100", "isRegex": false}
    ],
    "startsAt": "2024-01-15T00:00:00Z",
    "endsAt": "2024-01-15T06:00:00Z",
    "createdBy": "oncall-engineer",
    "comment": "Planned memory upgrade maintenance"
  }'
```

### Alertmanager Management API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/-/healthy` | GET | Health check |
| `/-/ready` | GET | Readiness check |
| `/-/reload` | POST | Hot reload configuration |
| `/api/v2/alerts` | POST | Receive alerts from Prometheus |
| `/api/v2/alerts` | GET | List current alerts |
| `/api/v2/silences` | GET/POST | List/create silences |
| `/api/v2/silence/<id>` | DELETE | Expire a silence |
