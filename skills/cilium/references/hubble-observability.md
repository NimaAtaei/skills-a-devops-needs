# Cilium Hubble Observability & Metrics (v1.20)

## Hubble Architecture & Setup

Hubble provides distributed eBPF network & security observability:
- **Hubble Server**: Embedded in `cilium-agent` (TCP `4244` must be open between nodes for Relay).
- **Hubble Relay**: Aggregates flows cluster-wide (port `4245` when port-forwarded).
- **Hubble UI**: Interactive Service Dependency Map (`cilium hubble ui` -> `http://localhost:12000`).

```bash
# Enable via Helm (Hubble server is on by default; enable Relay & UI)
helm upgrade cilium oci://quay.io/cilium/charts/cilium --version 1.20.5 \
  --namespace kube-system --reuse-values \
  --set hubble.relay.enabled=true \
  --set hubble.ui.enabled=true

# Or via Cilium CLI
cilium hubble enable --ui
cilium status
```

---

## Hubble CLI (`hubble observe`)

Install `hubble` CLI from `https://github.com/cilium/hubble/releases` and query via `-P` (auto port-forward):

```bash
hubble status -P
hubble observe -P --pod default/api --protocol http
hubble observe -P --pod default/api --verdict DROPPED
hubble observe -P --encrypted          # WireGuard / IPsec encrypted flows
hubble observe -P --unencrypted
hubble observe -P --reply              # Server-to-client replies only
hubble observe -P --since 5m -o json
```

---

## Hubble TLS & Metrics Authentication

- **mTLS between Hubble Server & Relay** is enabled by default (`hubble.tls.auto.method: cronJob` | `certmanager` | `helm` | user-provided `auto.enabled=false`).
  - *Warning*: `method: helm` certs do **not** auto-renew; run `helm upgrade` before expiry.
  - Required SANs: `*.<cluster-name>.hubble-grpc.cilium.io` (server), `*.hubble-relay.cilium.io` (Relay), `*.hubble-ui.cilium.io` (UI), `<cluster-name>.hubble-metrics.cilium.io` (metrics).
- **Hubble Metrics mTLS**: `--set hubble.metrics.tls.enabled=true --set hubble.metrics.tls.server.mtls.enabled=true --set hubble.metrics.tls.server.mtls.name=hubble-metrics-ca`.
- **CLI with TLS**: `kubectl -n kube-system get secret hubble-relay-server-certs -o jsonpath='{.data.ca\.crt}' | base64 -d > hubble-ca.crt` and pass `--tls --tls-ca-cert-files ./hubble-ca.crt --tls-server-name hubble.hubble-relay.cilium.io`.

---

## Hubble Flow Exporter (Static & Dynamic)

- **Static Exporter**: `hubble.export.static.enabled=true`, `filePath=/var/run/cilium/hubble/events.log` (or `stdout`), `fileMaxSizeMb=10`, `fileMaxBackups=5`, `fileCompress=false`, plus `allowList`/`denyList`/`fieldMask`.
- **Dynamic Exporter**: `hubble.export.dynamic.enabled=true` allows multiple `includeFilters`/`excludeFilters`, `fieldMask`, and `end` (RFC3339 auto-stop) via ConfigMap without restarting Cilium pods (~60s propagation).

---

## Prometheus Metrics & ServiceMonitors

### Ports & Enablement
- **`cilium-agent`**: `prometheus.enabled=true` (port `9962`), Envoy (port `9964`). Customize metrics with `+/-` prefixes in `prometheus.metrics`.
- **`cilium-operator`**: `operator.prometheus.enabled=true` (port `9963`, enabled by default).
- **Hubble Metrics**: `hubble.metrics.enabled` (headless service `hubble-metrics` on port `9965`), or `hubble.metrics.dynamic.enabled=true` for zero-restart filter updates.
- **OpenMetrics / Exemplars**: `hubble.metrics.enableOpenMetrics=true` + `httpV2:exemplars=true` (note: `httpV2` cannot coexist with deprecated `http`).
- **ServiceMonitors**: `prometheus.serviceMonitor.enabled`, `envoy.prometheus.serviceMonitor.enabled`, `operator.prometheus.serviceMonitor.enabled`, `hubble.metrics.serviceMonitor.enabled`, `clustermesh.apiserver.metrics.serviceMonitor.enabled`.

### Key Metric Families
- **Agent (`cilium_*`)**: `drop_count_total`, `forward_count_total`, `bpf_map_pressure{map_name}`, `bpf_ratelimit_dropped_total`, `datapath_conntrack_gc_entries`, `endpoint_regenerations_total`, `policy_implementation_delay`, `policy_missing_proxy_redirects`, `nat_endpoint_max_connection`, `bgp_control_plane_session_state`, `ipsec_xfrm_error`, `clustermesh_remote_cluster_readiness_status`, `cilium_feature_*`.
- **Operator (`cilium_operator_*` & `cilium_lbipam_*`)**: `ipam_available_ips`, `ipam_used_ips`, `ipam_needed_ips`, `lbipam_ips_available`, `lbipam_services_unsatisfied`, `doublewrite_*_identities`.
- **Hubble (`hubble_*`)**: `lost_events_total{source}`, `dns_queries_total`, `dns_responses_total`, `drop_total{reason,protocol}`, `flows_processed_total{protocol,type,subtype,verdict}`, `flows_to_world_total`, `http_requests_total`, `http_request_duration_seconds`, `tcp_flags_total`, `icmp_total`.

---

## Layer 7 Protocol Visibility & Redaction

- Datapath monitoring emits L3/L4 flows by default. To capture L7 DNS/HTTP metadata in Hubble without blocking other L7 traffic, apply a `CiliumNetworkPolicy` with L7 rules (e.g., `dns: [{ matchPattern: "*" }]` on port 53, `http: [{}]` on port 80). **Caveat**: Any L4/L7 traffic not matching the policy's rules is still dropped; DNS visibility is **egress-only**.
- **Sensitive Data Redaction**: Hubble does **not** redact L7 payloads by default—enable `--hubble-redact-enabled`, `--hubble-redact-http-urlquery`, `--hubble-redact-http-userinfo`, `--hubble-redact-http-headers-allow` / `-deny`.
