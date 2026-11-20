# Prometheus Architecture

## Overview

Prometheus is a standalone, open-source systems monitoring and alerting toolkit originally
built at SoundCloud in 2012. It joined the CNCF in 2016 as the second hosted project
after Kubernetes.

### Core Philosophy

- **Pull-based collection**: Prometheus scrapes metrics from instrumented targets over HTTP
  at configurable intervals, rather than receiving pushed data
- **Multi-dimensional data model**: Time series identified by metric name + key/value label
  pairs, enabling flexible slicing and dicing with PromQL
- **Autonomous single-server nodes**: Each Prometheus server operates independently with its
  own local TSDB — no distributed storage dependency
- **Reliability over completeness**: Designed to remain operational during infrastructure
  outages; each server is self-contained and diagnosable even when the rest of the
  infrastructure is degraded

### When Prometheus Fits

- Purely numeric time-series data (float64 values or native histograms)
- Machine-centric and microservice monitoring
- Dynamic, cloud-native environments with ephemeral workloads

### When Prometheus Does NOT Fit

- 100% precision billing or financial auditing — scrape gaps, downsampling, and counter
  resets mean data can have minor inaccuracies
- Event logging or distributed tracing (use Loki, Tempo, Jaeger, etc.)

## Architecture Components

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Prometheus  │────▶│  Alertmanager │────▶│  Notifications   │
│   Server     │     │  (dedup,     │     │  (Slack, PD,     │
│              │     │   route,     │     │   Email, etc.)   │
│  ┌────────┐  │     │   silence)   │     └──────────────────┘
│  │ TSDB   │  │     └──────────────┘
│  │ (local │  │
│  │ storage)│  │     ┌──────────────┐
│  └────────┘  │────▶│ Remote Write │────▶ Long-term storage
│              │     │ Endpoint     │      (Thanos, Cortex,
│  ┌────────┐  │     └──────────────┘       Mimir, VictoriaMetrics)
│  │ PromQL │  │
│  │ Engine │  │     ┌──────────────┐
│  └────────┘  │◀────│ Remote Read  │◀──── External TSDB
│              │     │ Endpoint     │
└──────┬───────┘     └──────────────┘
       │
       │ HTTP scrape (pull)
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Instrumented │  │  Exporters   │  │  Pushgateway │◀── Batch jobs
│ Applications │  │ (node, mysql,│  │ (intermediary│    (short-lived)
│ (/metrics)   │  │  blackbox)   │  │  push target)│
└──────────────┘  └──────────────┘  └──────────────┘
       ▲
       │
 Service Discovery
 (k8s, consul, DNS,
  EC2, file, HTTP, ...)
```

### Prometheus Server

The core binary responsible for:

1. **Target Discovery**: Finds scrape targets via static configuration or service discovery
   mechanisms (Kubernetes, Consul, DNS, EC2, file-based, HTTP-based, etc.)
2. **Scraping**: Periodically sends HTTP GET requests to each target's metrics endpoint
   (default `/metrics`) and parses the exposition format response
3. **TSDB Storage**: Stores scraped samples in a local time-series database optimized for
   append-heavy workloads with efficient compression (~1–2 bytes per sample)
4. **Rule Evaluation**: Periodically evaluates recording rules (precomputed aggregations)
   and alerting rules (threshold-based alert conditions) against stored data
5. **PromQL Engine**: Executes ad-hoc and dashboard queries against stored time series
6. **Alert Dispatch**: Sends firing alerts to configured Alertmanager instances
7. **Remote Write/Read**: Optionally forwards samples to remote storage systems and/or
   reads historical data from external TSDBs

### Alertmanager

Receives alerts from Prometheus servers and handles:

- **Deduplication**: Merges identical alerts from redundant HA Prometheus servers
- **Grouping**: Batches related alerts into single notifications (prevents alert storms)
- **Inhibition**: Suppresses dependent alerts when a parent alert is firing
- **Silencing**: Temporarily mutes alerts matching label matchers
- **Routing**: Directs alerts to appropriate receivers (Slack, PagerDuty, email, webhook, etc.)
- **High Availability**: Gossip protocol (memberlist, port 9094) replicates notification
  logs and silences across cluster nodes

### Pushgateway

Intermediary service for short-lived batch or ephemeral jobs that cannot be scraped:

- Job pushes metrics via HTTP POST/PUT to Pushgateway
- Prometheus scrapes the Pushgateway as a regular target
- **Warning**: Pushgateway retains metrics indefinitely until explicitly deleted; the `up`
  metric reflects Pushgateway health, NOT the original job's health

### Exporters

Bridge components translating third-party system metrics into Prometheus exposition format:

- **Node Exporter**: Linux/Unix host metrics (CPU, memory, disk, network)
- **Blackbox Exporter**: Probing HTTP, HTTPS, DNS, TCP, ICMP endpoints
- **MySQL/PostgreSQL/Redis Exporters**: Database-specific metrics
- Design principle: Fetch metrics from the third-party system on-demand during Prometheus
  scrape, not via background polling

### Client Libraries

Official libraries for instrumenting application code:

- **Go** (`client_golang`), **Java** (`client_java`), **Python** (`client_python`),
  **Ruby** (`client_ruby`)
- Provide Counter, Gauge, Histogram, Summary metric types
- Automatically register process and runtime collectors
- Expose HTTP `/metrics` handler for scraping

## Scrape Lifecycle

1. Prometheus evaluates service discovery rules to build the target list
2. `relabel_configs` are applied to filter, rename, or modify target labels
3. HTTP GET request sent to `<scheme>://<__address__><__metrics_path__>?<params>`
4. Response parsed according to negotiated exposition format
5. `metric_relabel_configs` applied to individual metric samples
6. Samples with `sample_limit`, `label_limit`, etc. violations are dropped
7. Surviving samples are appended to the TSDB head block
8. Auto-generated per-scrape metrics are recorded (`up`, `scrape_duration_seconds`, etc.)

## Agent Mode

Invoked with `--enable-feature=agent`:

- **Lightweight, stateless metrics forwarder** — scrapes targets and streams via `remote_write`
- Disables local querying, recording rules, alerting rules, and block compaction
- Retains only an ephemeral WAL buffer on disk for reliable streaming
- Ideal for edge environments, IoT, and resource-constrained Kubernetes nodes where full
  TSDB is unnecessary

## Comparison to Alternatives

| System | Model | Query Language | Storage |
|--------|-------|---------------|---------|
| **Graphite** | Passive push | Dot-separated hierarchical paths | Whisper files |
| **InfluxDB** | Push (line protocol) | InfluxQL / Flux | Custom TSM engine |
| **OpenTSDB** | Push | Telnet/HTTP API | HBase/Hadoop |
| **Nagios** | Active check scripts | OK/WARN/CRIT exit codes | Flat files |
| **Prometheus** | Active pull (HTTP scrape) | PromQL (multi-dimensional) | Local TSDB + remote write |

Key differentiator: Prometheus's pull model means the monitoring server controls scrape
frequency, immediately detects down targets (`up == 0`), and targets don't need to know
where monitoring infrastructure lives.

## LTS & Release Cycle

- Minor releases every ~6 weeks
- Designated LTS releases maintained with critical bug and security fixes for 1 year
