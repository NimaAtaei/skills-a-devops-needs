# Grafana as code with the Terraform provider — production pattern
#
# Use this instead of (or alongside) file provisioning when the Grafana API is
# the only channel (e.g. Grafana Cloud) or when multiple instances must stay in
# sync. Provider docs: registry.terraform.io/providers/grafana/grafana
#
# terraform {
#   required_providers { grafana = { source = "grafana/grafana" } }
# }
# export GRAFANA_AUTH=<service-account-token>   # least-privilege Editor
# export GRAFANA_URL=https://grafana.example.com

terraform {
  required_providers {
    grafana = {
      source  = "grafana/grafana"
      version = "~> 3.0"
    }
  }
}

provider "grafana" {
  url  = var.grafana_url
  auth = var.grafana_auth # service account token — never a user token
}

variable "grafana_url" {
  type      = string
  sensitive = true
}

variable "grafana_auth" {
  type      = string
  sensitive = true
}

# ─── Folder ──────────────────────────────────────────────────────────────────
resource "grafana_folder" "platform" {
  uid   = "platform"
  title = "Platform"
}

# ─── Data source ─────────────────────────────────────────────────────────────
resource "grafana_data_source" "prometheus" {
  type          = "prometheus"
  name          = "Prometheus"
  uid           = "prom-prod"
  url           = "http://prometheus.monitoring.svc:9090"
  is_default    = true
  json_data_encoded = jsonencode({
    httpMethod    = "POST"
    timeInterval  = "15s"
    prometheusType = "Prometheus"
    manageAlerts  = false
  })
}

# ─── Dashboard (JSON exported from a tested dashboard) ───────────────────────
resource "grafana_dashboard" "cdn_origin_health" {
  folder_uid   = grafana_folder.platform.uid
  uid          = "prod-cdn-origin-health"
  title        = "[Prod] CDN — Origin Health"
  config_json  = file("${path.module}/dashboards/prod-cdn-origin-health.json")
  overwrite    = true
  message      = "terraform: ${var.pipeline_id}"
  # The JSON file is the same model as skills/grafana/examples/dashboard-json-model.json
}

# ─── Alert rule group (Grafana-managed) ──────────────────────────────────────
resource "grafana_rule_group" "node_alerts" {
  org_id          = 1
  name            = "node-alerts"
  folder_uid      = "platform"
  interval_seconds = 60

  rule {
    name      = "NodeCpuHigh"
    condition = "C"
    for       = "5m"
    annotations = {
      summary     = "CPU above 90% on {{ \$labels.instance }}"
      runbook_url = "https://runbooks.example.com/node/cpu-high"
    }
    labels = {
      severity = "warning"
      team     = "platform"
    }
    data {
      ref_id = "A"
      relative_time_range { from = 600 to = 0 }
      datasource_uid = grafana_data_source.prometheus.uid
      model          = jsonencode({ expr = "100 - avg by (instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100" })
    }
    data {
      ref_id         = "B"
      datasource_uid = "-100" # built-in expression engine
      model          = jsonencode({ type = "reduce", expression = "A", reducer = "lastNotNull" })
    }
    data {
      ref_id         = "C"
      datasource_uid = "-100"
      model          = jsonencode({ type = "threshold", expression = "B", conditions = [{ evaluator = { type = "gt", params = [90] } }] })
    }
  }
}

# ─── Contact points + notification policy ────────────────────────────────────
resource "grafana_contact_point" "oncall_slack" {
  name = "oncall-slack"

  slack {
    endpoint  = var.slack_webhook_url # sensitive — provided by CI/secret store
    title     = "{{ .CommonLabels.alertname }} [{{ .Status }}]"
  }
}

resource "grafana_notification_policy" "policy" {
  group_wait      = "30s"
  group_interval  = "5m"
  group_by        = ["grafana_folder", "alertname"]
  contact_point   = grafana_contact_point.oncall_slack.name
  repeat_interval = "4h"

  policy {
    contact_point   = grafana_contact_point.oncall_slack.name
    group_wait      = "0s"
    group_interval  = "1m"
    repeat_interval = "30m"
    matcher_severity = "equals critical"
  }
}

# ─── Service account for CI (least privilege) ────────────────────────────────
resource "grafana_service_account" "ci_exporter" {
  name        = "ci-dashboard-exporter"
  role        = "Viewer"
  is_disabled = false
}

resource "grafana_service_account_token" "ci_exporter_token" {
  name          = "ci-runner"
  service_account_id = grafana_service_account.ci_exporter.id
  seconds_to_live = 7776000 # 90d — rotate via pipeline
}

output "ci_token_id" {
  value     = grafana_service_account_token.ci_exporter_token.id
  sensitive = true
}
