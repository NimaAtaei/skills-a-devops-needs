# Agent Skills Repository

A modular collection of specialized skills designed for AI agents (Antigravity, Claude Code, Cursor, and other agent frameworks).

## Cloning & Updating

This repository contains submodules (e.g. `skills/gitlab-ci`). To ensure all skills are automatically fetched and kept in sync:

```bash
# Clone with all skills:
git clone --recurse-submodules <repo-url>

# Or enable automatic submodule recursion on your machine:
git config --global submodule.recurse true
```

Whenever you run `git pull` in this repository, Git will automatically update all submodules.

## Skills Directory

### [CloudNativePG (CNPG) v1.30](./skills/cloudnative-pg/SKILL.md)
Comprehensive architecture guides, declarative configurations, and operational runbooks for running PostgreSQL clusters on Kubernetes using CloudNativePG v1.30.

#### Coverage:
- **Architecture**: PID 1 Instance Manager, Primary Lease (serialized promotion), streaming replication, synchronous quorum, and logical decoding slots for CDC.
- **Declarative Resources**: `Cluster`, `DatabaseRole` (with automated TLS client certs), `Database`, `Backup`, `ScheduledBackup`, and `Pooler` CRDs.
- **Services & Traffic Policies**: Custom service configurations supporting `internalTrafficPolicy: Local` and `externalTrafficPolicy: Local`.
- **Disaster Recovery**: Barman Cloud object stores (S3/GCS/Azure/MinIO), VolumeSnapshots, Point-in-Time Recovery (PITR), and cross-region Replica Clusters.
- **Storage & Performance**: Dedicated WAL storage, online volume expansion, declarative tablespaces, and `cnpg bench` (fio & pgbench).
- **Operations & Day-2**: In-depth `kubectl cnpg` CLI cheatsheet, rolling upgrades, zero-downtime reloads, instance fencing, maintenance mode, and troubleshooting runbooks.

---

### [GitLab CI/CD](./skills/gitlab-ci/SKILL.md)
Expert guide and runbooks for authoring, validating, debugging, and optimizing GitLab CI/CD pipelines (integrated via Git submodule from `https://gitlab.com/gitlab-org/ci-cd/gitlab-ci-skill.git` on branch `main`).

#### Coverage:
- Pipeline creation from scratch and incremental job authoring.
- CI/CD Catalog component integration and rules authoring.
- Local pipeline validation and troubleshooting failing jobs.
- DAG execution (`needs:`), parallel matrices, and cache optimization.

---

### [Kubernetes](./skills/kubernetes/SKILL.md)
Production-grade guide and operational runbooks for Kubernetes architecture, workloads, networking, storage, security, and cluster operations synthesized directly from the official Kubernetes documentation.

#### Coverage:
- **Control Plane & Nodes**: Architecture loops, etcd quorum, kubelet, and CRI runtimes.
- **Workloads**: Hardened Deployments, StatefulSets with volume templates, DaemonSets, Jobs, CronJobs, and probes.
- **Networking & Gateway API**: ClusterIP, NodePort, LoadBalancer, Ingress, Gateway API HTTPRoutes, and default-deny NetworkPolicies.
- **Storage & CSI**: StorageClasses (WaitForFirstConsumer), PVC expansion, and VolumeSnapshots.
- **Security & RBAC**: Pod Security Standards (Restricted profile), scoped RBAC, and container context hardening.
- **Scheduling & Operations**: Topology Spread Constraints, taints/tolerations, zero-downtime rollouts, and `kubectl debug` troubleshooting.

---

### [Prometheus](./skills/prometheus/SKILL.md)
Exhaustive reference for Prometheus v3.x systems monitoring and alerting toolkit synthesized directly from the official Prometheus documentation.

#### Coverage:
- **Server Architecture**: Pull model, target discovery lifecycle, Agent Mode (stateless forwarding), Gorilla compression, and scrape evaluation loops.
- **Data Model & Metric Types**: Counters, Gauges, Classic Histograms, Summaries, and dynamic Native Histograms with exponential bucket layouts.
- **PromQL & Querying**: Selectors, operators, aggregations, 50+ built-in functions, subqueries, offset/@ modifiers, staleness tracking, and type coercion.
- **Configuration**: Complete `prometheus.yml` schema, global settings, scrape configs, 30+ service discovery mechanisms (Kubernetes SD roles, Consul, DNS, EC2, HTTP SD, File SD), and relabeling pipelines (`relabel_configs` and `metric_relabel_configs`).
- **Alerting & Alertmanager**: Alerting rule evaluation (`for`, `keep_firing_for`), Alertmanager architecture, gossip HA mesh, routing trees, multi-channel receivers (Slack, PagerDuty, Email, Webhook, OpsGenie), inhibition rules, scheduled muting (`time_intervals`), and silences.
- **Storage, Federation & Remote Write**: Local TSDB block layout (chunks, index, tombstones), WAL mechanics, compaction, retention (time & size), backfilling, snapshots, hierarchical and cross-service federation, and Remote Write 1.0/2.0 specifications with queue tuning.
- **Instrumentation & Exporters**: Client libraries (Go, Java, Python, Ruby), exposition formats (Prometheus Text 0.0.4/1.0.0, OpenMetrics 1.0.0, Protobuf), content negotiation, Pushgateway mechanics, writing exporters, and multi-target probing patterns.
- **Operations & Security**: Security model, `web-config.yml` (TLS/mTLS and bcrypt basic auth), CLI flags for `prometheus` and `alertmanager`, `promtool` commands (config checking, rule unit tests, TSDB analysis), Management and Admin APIs.
- **Best Practices & Zen**: Metric and label naming conventions (`_total`, `_seconds`, `_bytes`), cardinality control, recording rule naming (`level:metric:operation`), symptom-based alerting, and the 15 Zen principles of Prometheus.

---

## Adding More Skills

This repository is designed to host multiple database and engineering skills. When adding new skills (e.g. Vanilla PostgreSQL Tuning, Patroni, pgvector, or connection poolers):

1. Create a dedicated directory: `skills/<skill-name>/`
2. Define a root `SKILL.md` with standard YAML frontmatter (`name` and `description`).
3. Place architectural and runbook deep dives in `references/`.
4. Place sample manifests and configuration templates in `examples/`.
