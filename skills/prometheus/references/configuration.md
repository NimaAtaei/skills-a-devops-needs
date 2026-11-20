# Prometheus Configuration Reference

## Configuration File Schema (`prometheus.yml`)

Top-level keys:

```yaml
global:          <global_config>
alerting:        <alerting_config>
rule_files:      [ <filepath_glob>, ... ]
scrape_configs:  [ <scrape_config>, ... ]
storage:         <storage_config>
tracing:         <tracing_config>
remote_write:    [ <remote_write_config>, ... ]
remote_read:     [ <remote_read_config>, ... ]
```

## Global Configuration

```yaml
global:
  # How frequently to scrape targets (default: 1m)
  scrape_interval: 15s

  # Scrape timeout per target (default: 10s, must be <= scrape_interval)
  scrape_timeout: 10s

  # How frequently to evaluate recording/alerting rules (default: 1m)
  evaluation_interval: 15s

  # Labels attached to all outgoing time series, alerts, and federation
  external_labels:
    cluster: us-east-1
    environment: production

  # Priority list of protocols to negotiate in Accept header
  scrape_protocols:
    - PrometheusProto
    - OpenMetricsText1.0.0
    - OpenMetricsText0.0.1
    - PrometheusText1.0.0
    - PrometheusText0.0.4

  # Path to JSON file where all PromQL queries will be logged
  query_log_file: /var/log/prometheus/query.log
```

## Scrape Configuration

```yaml
scrape_configs:
  - job_name: "my-service"

    # Override global defaults per job
    scrape_interval: 30s
    scrape_timeout: 10s

    # Metrics endpoint path (default: /metrics)
    metrics_path: /metrics

    # Scrape scheme (default: http)
    scheme: https

    # --- Label Conflict Resolution ---
    # true: target labels win over server-attached labels
    # false (default): conflicting target labels renamed to exported_<name>
    honor_labels: false

    # true (default): respect explicit timestamps in exposition
    honor_timestamps: true

    # Insert staleness markers when timestamped metrics disappear
    track_timestamps_staleness: false

    # Request gzip-compressed responses (default: true)
    enable_compression: true

    # --- Safety Limits ---
    # Max samples per scrape (0 = unlimited)
    sample_limit: 0
    # Max targets per SD (0 = unlimited)
    target_limit: 0
    # Max labels per sample (0 = unlimited)
    label_limit: 0
    # Max length of label names (0 = unlimited)
    label_name_length_limit: 0
    # Max length of label values (0 = unlimited)
    label_value_length_limit: 0
    # Max uncompressed response body size (0 = unlimited)
    body_size_limit: 0

    # Path to log scrape failures
    scrape_failure_log_file: /var/log/prometheus/scrape-failures.log

    # URL query parameters passed to scrape requests
    params:
      module: [http_2xx]

    # --- Authentication ---
    basic_auth:
      username: prometheus
      password_file: /etc/prometheus/password

    # OR bearer token
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/token

    # OR OAuth2
    oauth2:
      client_id: "..."
      client_secret: "..."
      token_url: "https://auth.example.com/token"
      scopes: [metrics]

    # --- TLS ---
    tls_config:
      ca_file: /etc/prometheus/ca.pem
      cert_file: /etc/prometheus/cert.pem
      key_file: /etc/prometheus/key.pem
      insecure_skip_verify: false
      min_version: TLS12

    # --- Proxy ---
    proxy_url: "http://proxy:8080"
    no_proxy: "localhost,127.0.0.1"
    follow_redirects: true
    enable_http2: true

    # --- Target Discovery ---
    static_configs:
      - targets: ['localhost:9090']
        labels:
          env: production

    # --- Relabeling ---
    relabel_configs: [ <relabel_config>, ... ]
    metric_relabel_configs: [ <relabel_config>, ... ]
```

## Service Discovery Types

Prometheus supports 30+ service discovery mechanisms. Each populates target metadata labels
prefixed with `__meta_<sd_type>_*` that can be used in `relabel_configs`.

### 1. Static Configs

```yaml
static_configs:
  - targets: ['host1:9090', 'host2:9090']
    labels:
      datacenter: dc1
```

### 2. File-based SD

```yaml
file_sd_configs:
  - files:
      - '/etc/prometheus/targets/*.json'
      - '/etc/prometheus/targets/*.yml'
    refresh_interval: 5m
```

JSON format:

```json
[
  {
    "targets": ["host1:9090", "host2:9090"],
    "labels": { "env": "production" }
  }
]
```

### 3. HTTP SD

```yaml
http_sd_configs:
  - url: 'http://sd-service:8080/targets'
    refresh_interval: 30s
    authorization:
      type: Bearer
      credentials: "token"
```

Returns same JSON format as file SD. Must return HTTP 200 with `application/json`.

### 4. Kubernetes SD

```yaml
kubernetes_sd_configs:
  - role: <role>          # node | pod | service | endpoints | endpointslice | ingress
    api_server: 'https://kubernetes.default.svc'
    kubeconfig_file: /etc/prometheus/kubeconfig
    namespaces:
      own_namespace: false
      names: [default, monitoring]
    selectors:
      - role: pod
        label: "app=myapp"
        field: "status.phase=Running"
    attach_metadata:
      node: true          # Attach node metadata to discovered targets
```

**Roles and their meta-labels**:

| Role | Discovers | Key `__meta_kubernetes_*` labels |
|------|-----------|------|
| `node` | Cluster nodes | `_node_name`, `_node_label_<name>`, `_node_annotation_<name>`, `_node_address_<type>` |
| `pod` | All pods | `_pod_name`, `_pod_ip`, `_pod_label_<name>`, `_pod_annotation_<name>`, `_pod_container_name`, `_pod_container_port_name`, `_pod_container_port_number`, `_pod_ready`, `_pod_phase`, `_pod_node_name`, `_namespace` |
| `service` | Services | `_service_name`, `_service_label_<name>`, `_service_annotation_<name>`, `_service_port_name`, `_service_port_number`, `_service_port_protocol`, `_service_type`, `_namespace` |
| `endpoints` | Endpoints | `_endpoints_name`, `_endpoint_ready`, `_endpoint_port_name`, `_endpoint_port_number`, plus pod and service labels |
| `endpointslice` | EndpointSlices | Same as endpoints with `_endpointslice_*` prefix, `_endpoint_conditions_ready`, `_endpoint_conditions_serving`, `_endpoint_conditions_terminating` |
| `ingress` | Ingresses | `_ingress_name`, `_ingress_label_<name>`, `_ingress_annotation_<name>`, `_ingress_scheme`, `_ingress_host`, `_ingress_path`, `_namespace` |

### 5. Consul SD

```yaml
consul_sd_configs:
  - server: 'localhost:8500'
    token: "consul-acl-token"
    datacenter: dc1
    services: ['web', 'api']       # Empty = all services
    tags: ['production']
    node_meta:
      rack: us-east-1a
    allow_stale: true
    refresh_interval: 30s
```

### 6. DNS SD

```yaml
dns_sd_configs:
  - names:
      - 'myservice.mesos.example.com'
      - '_prometheus._tcp.example.com'
    type: SRV      # SRV | A | AAAA | MX (default: SRV)
    port: 9090     # Required for A/AAAA (SRV provides port)
    refresh_interval: 30s
```

### 7. EC2 SD

```yaml
ec2_sd_configs:
  - region: us-east-1
    access_key: AKIAI...
    secret_key: SECRET
    port: 9100
    filters:
      - name: tag:Environment
        values: [production]
      - name: instance-state-name
        values: [running]
    refresh_interval: 60s
```

### 8–30. Other SD Types

| SD Type | Discovery Source |
|---------|-----------------|
| `azure_sd_configs` | Azure VMs / VM Scale Sets |
| `gce_sd_configs` | Google Compute Engine instances |
| `docker_sd_configs` | Local/remote Docker daemon containers |
| `dockerswarm_sd_configs` | Docker Swarm nodes/services/tasks |
| `openstack_sd_configs` | OpenStack Nova instances |
| `digitalocean_sd_configs` | DigitalOcean Droplets |
| `hetzner_sd_configs` | Hetzner Cloud & Robot |
| `linode_sd_configs` | Linode instances |
| `lightsail_sd_configs` | AWS Lightsail instances |
| `scaleway_sd_configs` | Scaleway compute instances |
| `ovhcloud_sd_configs` | OVHcloud public cloud |
| `vultr_sd_configs` | Vultr VPS instances |
| `ionos_sd_configs` | IONOS Cloud servers |
| `oci_sd_configs` | Oracle Cloud Infrastructure |
| `outscale_sd_configs` | 3DS OUTSCALE VMs |
| `stackit_sd_configs` | STACKIT Cloud projects |
| `eureka_sd_configs` | Netflix Eureka registry |
| `nomad_sd_configs` | HashiCorp Nomad services |
| `kuma_sd_configs` | Kuma service mesh |
| `puppetdb_sd_configs` | PuppetDB nodes |
| `uyuni_sd_configs` | Uyuni / SUSE Manager |
| `nerve_sd_configs` | Zookeeper Nerve |
| `serverset_sd_configs` | Zookeeper ServerSet |
| `marathon_sd_configs` | Mesosphere Marathon |
| `triton_sd_configs` | Joyent Triton |

All SD types share common fields: `refresh_interval`, `tls_config`, `basic_auth`,
`authorization`, `oauth2`, `proxy_url`, `follow_redirects`.

## Relabeling

Relabeling transforms target labels (`relabel_configs`) or metric labels
(`metric_relabel_configs`) using a pipeline of sequential rules.

```yaml
relabel_configs:
  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
    action: keep
    regex: "true"

  - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
    action: replace
    target_label: __metrics_path__
    regex: (.+)

  - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
    action: replace
    regex: ([^:]+)(?::\d+)?;(\d+)
    replacement: $1:$2
    target_label: __address__

  - action: labelmap
    regex: __meta_kubernetes_pod_label_(.+)

  - source_labels: [__meta_kubernetes_namespace]
    action: replace
    target_label: namespace

  - source_labels: [__meta_kubernetes_pod_name]
    action: replace
    target_label: pod
```

### Relabel Actions

| Action | Description |
|--------|-------------|
| `replace` | Set `target_label` to `replacement` if regex matches concatenated `source_labels` (default action) |
| `keep` | Keep targets/metrics where `source_labels` match `regex`; drop all others |
| `drop` | Drop targets/metrics where `source_labels` match `regex` |
| `hashmod` | Compute `hash(source_labels) % modulus`, store in `target_label` |
| `labelmap` | Match regex against all label **names**; copy value to new name from `replacement` |
| `labeldrop` | Drop all labels with names matching `regex` |
| `labelkeep` | Keep only labels with names matching `regex` |
| `lowercase` | Lowercase source label value and store in `target_label` |
| `uppercase` | Uppercase source label value and store in `target_label` |

### Relabel Config Fields

| Field | Default | Description |
|-------|---------|-------------|
| `source_labels` | — | List of source label names to concatenate |
| `separator` | `;` | Separator between concatenated source values |
| `regex` | `(.*)` | Regex matched against concatenated value |
| `target_label` | — | Label to write result to |
| `replacement` | `$1` | Replacement string (supports `$1`, `$2`, etc.) |
| `modulus` | — | Modulus for `hashmod` action |
| `action` | `replace` | One of the actions above |

## Alerting Configuration

```yaml
alerting:
  alert_relabel_configs:
    - source_labels: [severity]
      regex: info
      action: drop

  alertmanagers:
    - scheme: https
      tls_config:
        ca_file: /etc/prometheus/am-ca.pem
      basic_auth:
        username: prometheus
        password_file: /etc/prometheus/am-password
      static_configs:
        - targets: ['alertmanager1:9093', 'alertmanager2:9093']
      # OR discover via Kubernetes
      kubernetes_sd_configs:
        - role: pod
          namespaces:
            names: [monitoring]
      relabel_configs:
        - source_labels: [__meta_kubernetes_pod_label_app]
          regex: alertmanager
          action: keep
      # Time to wait for an alert to resolve if Prometheus stops sending it
      timeout: 10s
      api_version: v2
```

## Remote Write Configuration

```yaml
remote_write:
  - url: "https://remote-storage.example.com/api/v1/write"
    remote_timeout: 30s

    # Send exemplars with samples (default: true in v3)
    send_exemplars: true
    # Send native histograms (default: false)
    send_native_histograms: false

    # Authentication (same options as scrape_config)
    basic_auth:
      username: writer
      password_file: /etc/prometheus/rw-password
    tls_config:
      cert_file: /etc/prometheus/rw-cert.pem
      key_file: /etc/prometheus/rw-key.pem

    # Filter series before sending
    write_relabel_configs:
      - source_labels: [__name__]
        regex: "expensive_metric_.*"
        action: drop

    # Queue tuning
    queue_config:
      capacity: 10000            # Samples in memory per shard (default: 10000)
      max_shards: 50             # Max concurrent sending goroutines (default: 50)
      min_shards: 1              # Min concurrent sending goroutines (default: 1)
      max_samples_per_send: 2000 # Batch size per HTTP request (default: 2000)
      batch_send_deadline: 5s    # Max time sample waits before batch send (default: 5s)
      min_backoff: 30ms          # Initial retry backoff (default: 30ms)
      max_backoff: 5s            # Maximum retry backoff (default: 5s)
      retry_on_http_429: true    # Retry on 429 Too Many Requests (default: true)

    # Metadata sending
    metadata_config:
      send: true
      send_interval: 1m
      max_samples_per_send: 500
```

## Remote Read Configuration

```yaml
remote_read:
  - url: "https://remote-storage.example.com/api/v1/read"
    remote_timeout: 1m
    # Whether to also read recent data (overlapping with local TSDB head)
    read_recent: false
    # Only read series matching these label matchers
    required_matchers:
      job: important-service
    tls_config:
      ca_file: /etc/prometheus/rr-ca.pem
```

## Storage Configuration

```yaml
storage:
  tsdb:
    # Allow ingestion of out-of-order samples up to this duration in the past
    out_of_order_time_window: 30m
  exemplars:
    # Circular buffer size for exemplars (default: 0 = disabled)
    max_exemplars: 100000
```

## Tracing Configuration

```yaml
tracing:
  endpoint: "otel-collector:4317"
  insecure: false
  sampling_fraction: 0.1
  tls_config:
    cert_file: /etc/prometheus/trace-cert.pem
    key_file: /etc/prometheus/trace-key.pem
```

## Configuration Reload

Three methods to hot-reload configuration without restart:

1. **HTTP POST**: `curl -X POST http://localhost:9090/-/reload` (requires `--web.enable-lifecycle`)
2. **SIGHUP**: `kill -HUP <prometheus_pid>`
3. **Graceful shutdown**: `kill -TERM <pid>` or `POST /-/quit` (requires `--web.enable-lifecycle`)
