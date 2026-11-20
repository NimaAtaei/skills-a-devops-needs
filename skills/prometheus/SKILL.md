---
name: prometheus
description: >
  Prometheus v3.x monitoring and alerting toolkit — pull-based time-series collection,
  PromQL query language, multi-dimensional data model, Alertmanager notification pipeline,
  TSDB storage internals, service discovery, federation, remote write/read, client
  instrumentation, exposition formats, and operational best practices.
---

# Prometheus Monitoring & Alerting

Comprehensive reference for the Prometheus ecosystem: server architecture, configuration,
PromQL, alerting, storage, instrumentation, and operations.

## When to Use This Skill

Activate when the task involves:

- Configuring `prometheus.yml` (scrape configs, service discovery, relabeling, remote write/read)
- Writing or debugging **PromQL** queries, recording rules, or alerting rules
- Setting up **Alertmanager** routing trees, receivers, inhibition, or silences
- Understanding **TSDB** storage, WAL, compaction, retention, or backfilling
- Instrumenting applications with Prometheus **client libraries**
- Deploying Prometheus in Kubernetes with **service discovery** or **federation**
- Tuning **remote write** queue configuration or choosing exposition formats
- Following metric **naming conventions** and cardinality best practices

## Reference Docs

| Document | Covers |
|----------|--------|
| [Architecture](references/architecture.md) | Server components, pull model, TSDB overview, agent mode, scrape lifecycle |
| [Data Model & Metrics](references/data-model-and-metrics.md) | Time series identity, metric types (counter, gauge, histogram, summary, native histogram), jobs & instances, auto-generated scrape metrics |
| [PromQL](references/promql.md) | Selectors, operators, aggregations, 50+ functions, subqueries, offset/@ modifiers, type system |
| [Configuration](references/configuration.md) | `prometheus.yml` schema, global settings, scrape_configs, 30+ service discovery types, relabeling mechanics, remote write/read, storage, tracing |
| [Alerting & Alertmanager](references/alerting-and-alertmanager.md) | Alerting rules, `for`/`keep_firing_for`, Alertmanager architecture, routing tree, grouping, inhibition, silences, receivers (Slack/PagerDuty/email/webhook/OpsGenie + 10 more), HA gossip, notification templates |
| [Storage & Federation](references/storage-and-federation.md) | Local TSDB blocks, WAL, compaction, retention (time & size), backfilling, snapshots, federation endpoint, remote write 1.0/2.0 spec, remote read |
| [Instrumentation](references/instrumentation.md) | Client libraries (Go/Java/Python/Ruby), exposition formats (text/OpenMetrics/protobuf), content negotiation, Pushgateway, writing exporters, multi-target pattern |
| [Operations & Security](references/operations-and-security.md) | Security model, TLS/mTLS `web-config.yml`, basic auth, CLI flags (`prometheus`/`promtool`), management API, TSDB admin API, rule unit testing |
| [Best Practices](references/best-practices.md) | Metric & label naming, `_total`/`_seconds`/`_bytes` suffixes, cardinality control, histograms vs summaries, alerting philosophy, recording rule naming, Zen of Prometheus |

## Example Configurations

| Example | Purpose |
|---------|---------|
| [prometheus-kubernetes-config.yaml](examples/prometheus-kubernetes-config.yaml) | Production `prometheus.yml` with Kubernetes pod/service/node SD, relabeling, and remote write |
| [alerting-rules.yaml](examples/alerting-rules.yaml) | Production alerting rules: target down, high error rate, latency SLO, disk pressure, pod restarts |
| [recording-rules.yaml](examples/recording-rules.yaml) | Pre-computed aggregations following `level:metric:operation` naming convention |
| [alertmanager-config.yaml](examples/alertmanager-config.yaml) | Alertmanager with routing tree, Slack/PagerDuty/email receivers, inhibition rules, time-based muting |
| [web-tls-config.yaml](examples/web-tls-config.yaml) | TLS/mTLS and basic auth `web-config.yml` for Prometheus and Alertmanager |
| [federation-scrape-config.yaml](examples/federation-scrape-config.yaml) | Hierarchical federation scrape job with `honor_labels` |
| [rule-unit-tests.yaml](examples/rule-unit-tests.yaml) | `promtool test rules` test file with synthetic input series and expected alert/query assertions |
