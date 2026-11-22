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

## How to Install & Use Skills

Skills in this repository follow the open **Agent Skill specification** (`SKILL.md` with YAML frontmatter `name` and `description`, accompanied by `references/` and `examples/`). They are compatible with all modern AI agent frameworks through progressive disclosure.

### 1. Google Antigravity

Antigravity natively reads `AGENTS.md` and discovers skills globally or per-workspace.

- **Option A (Workspace - Automatic)**:
  Open this repository directly in Antigravity or add it to your active workspace. Antigravity automatically detects `AGENTS.md` and index skills.

- **Option B (Global Install)**:
  Copy or symlink individual skills into your global Antigravity skills directory:
  ```bash
  # Linux / macOS
  mkdir -p ~/.gemini/antigravity/skills
  ln -s "$(pwd)/skills/kubernetes" ~/.gemini/antigravity/skills/kubernetes
  ln -s "$(pwd)/skills/cloudnative-pg" ~/.gemini/antigravity/skills/cloudnative-pg
  ln -s "$(pwd)/skills/prometheus" ~/.gemini/antigravity/skills/prometheus
  ln -s "$(pwd)/skills/grafana" ~/.gemini/antigravity/skills/grafana

  # Windows (PowerShell - Administrator)
  New-Item -ItemType SymbolicLink -Path "$HOME\.gemini\antigravity\skills\kubernetes" -Target "$PWD\skills\kubernetes"
  New-Item -ItemType SymbolicLink -Path "$HOME\.gemini\antigravity\skills\cloudnative-pg" -Target "$PWD\skills\cloudnative-pg"
  New-Item -ItemType SymbolicLink -Path "$HOME\.gemini\antigravity\skills\prometheus" -Target "$PWD\skills\prometheus"
  New-Item -ItemType SymbolicLink -Path "$HOME\.gemini\antigravity\skills\grafana" -Target "$PWD\skills\grafana"
  ```

- **Option C (Plugin Package)**:
  Use the `/plugin` command or package the repository using the Antigravity Customization CLI:
  ```bash
  agy plugin add --path .
  ```

---

### 2. Claude Code

Claude Code discovers skills from `.claude/skills/` (project-level) or `~/.claude/skills/` (user-level).

- **Project-Level Installation**:
  ```bash
  mkdir -p .claude/skills
  # Link all skills
  ln -s "$(pwd)/skills/"* .claude/skills/
  ```

- **User-Level (Global) Installation**:
  ```bash
  mkdir -p ~/.claude/skills
  cp -r skills/* ~/.claude/skills/
  ```

- **Referencing in `CLAUDE.md`**:
  Add the following snippet to your project's `CLAUDE.md`:
  ```markdown
  ## Specialized Skills
  When dealing with Kubernetes, CloudNativePG, Prometheus, or GitLab CI, consult the skill
  entrypoints in `skills/<skill-name>/SKILL.md` for in-depth architecture and runbooks.
  ```

---

### 3. OpenAI Codex / Codex CLI

For OpenAI Codex and terminal agents reading instruction prompts:

- **Via `CODEX.md` or `AGENTS.md`**:
  Codex automatically ingests repository root instruction files. Symlink or copy `AGENTS.md` to your project root:
  ```bash
  ln -s AGENTS.md CODEX.md
  ```

- **Prompt / Context Injection**:
  Pass the skill entrypoints into Codex context when prompting:
  ```bash
  codex "Review our deployment manifests against skills/kubernetes/SKILL.md and skills/cloudnative-pg/SKILL.md"
  ```

---

### 4. ZCode / Zed AI

Zed's Assistant panel integrates slash commands and contextual file inclusion:

- **Option A (Assistant Slash Commands)**:
  Reference skills directly inside the Assistant chat window:
  ```text
  /file skills/prometheus/SKILL.md How do I configure remote write queue capacity?
  ```

- **Option B (Project Settings)**:
  Configure `.zed/settings.json` to include skill paths in the assistant context:
  ```json
  {
    "assistant": {
      "default_model": {
        "provider": "anthropic",
        "model": "claude-3-7-sonnet"
      },
      "context_servers": [],
      "system_prompt": "You have access to specialized engineering skills in the skills/ directory. Always check skills/<topic>/SKILL.md before writing Kubernetes manifests, PostgreSQL clusters, or Prometheus alerting rules."
    }
  }
  ```

---

### 5. Cursor

Cursor uses `.cursorrules` or `.cursor/rules/*.mdc` files for agent guidance:

- **Option A (`.cursorrules`)**:
  Create or update `.cursorrules` in your project root:
  ```markdown
  # Domain Skills
  Refer to the following skill documentation when designing or debugging workloads:
  - CloudNativePG: skills/cloudnative-pg/SKILL.md
  - Kubernetes: skills/kubernetes/SKILL.md
  - Prometheus: skills/prometheus/SKILL.md
  - Grafana: skills/grafana/SKILL.md
  - GitLab CI: skills/gitlab-ci/SKILL.md
  ```

- **Option B (Cursor MDC Rules in `.cursor/rules/`)**:
  Create `.cursor/rules/skills.mdc`:
  ```yaml
  ---
  description: Modular DevOps and SRE Skills for Kubernetes, Databases, and Observability
  globs: ["**/*.yaml", "**/*.yml", "**/Dockerfile", "**/*.promql"]
  alwaysApply: true
  ---

  Before modifying manifests or writing queries, consult:
  - `skills/cloudnative-pg/SKILL.md` for PostgreSQL clusters, backups, and pooling.
  - `skills/kubernetes/SKILL.md` for workloads, ingress, Gateway API, and security.
  - `skills/prometheus/SKILL.md` for metrics, PromQL, alert rules, and TSDB.
  - `skills/grafana/SKILL.md` for dashboards, variables, provisioning, and unified alerting.
  - `skills/gitlab-ci/SKILL.md` for pipeline authoring.
  ```

---

### 6. Windsurf / Cascade

Add skill references to `.windsurfrules`:

```markdown
# Specialized Engineering Skills
When tasked with cluster architecture, container workloads, or metrics:
1. Review `skills/kubernetes/SKILL.md` for production manifests.
2. Review `skills/cloudnative-pg/SKILL.md` for PostgreSQL configuration and CNPG operations.
3. Review `skills/prometheus/SKILL.md` for PromQL syntax and Alertmanager setup.
4. Review `skills/grafana/SKILL.md` for dashboards, variables, provisioning, and unified alerting.
```

---

### 7. GitHub Copilot (Workspace Instructions)

Create or update `.github/copilot-instructions.md`:

```markdown
# Copilot Workspace Instructions
This repository includes specialized domain knowledge in the `skills/` directory.
When generating Kubernetes manifests, Prometheus queries, or CI pipelines:
- Follow conventions established in `skills/<skill-name>/SKILL.md`.
- Use production-ready patterns from `skills/<skill-name>/examples/`.
```

---

### 8. Quick Install Script (All Agents)

To link skills into all supported local agent configurations at once:

```bash
#!/usr/bin/env bash
# Link skills to Antigravity, Claude Code, and Cursor in current workspace

set -e

# Claude Code
mkdir -p .claude/skills
for skill in skills/*; do
  [ -d "$skill" ] && ln -sf "$(pwd)/$skill" ".claude/skills/$(basename "$skill")"
done

# Antigravity (global)
mkdir -p "$HOME/.gemini/antigravity/skills"
for skill in skills/*; do
  [ -d "$skill" ] && ln -sf "$(pwd)/$skill" "$HOME/.gemini/antigravity/skills/$(basename "$skill")"
done

# Cursor
mkdir -p .cursor/rules
cat << 'EOF' > .cursor/rules/skills.mdc
---
description: Engineering and DevOps Skills
globs: ["**/*.yaml", "**/*.yml", "**/*.json"]
alwaysApply: true
---
Consult skills/<skill>/SKILL.md for Kubernetes, CloudNativePG, and Prometheus best practices.
EOF

echo "✓ Skills linked successfully to Claude Code, Antigravity, and Cursor!"
```

---

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

### [Grafana](./skills/grafana/SKILL.md)
Comprehensive reference for building, provisioning, and operating Grafana 13.x — dashboards, template variables, file-based provisioning, and unified alerting, synthesized for production observability stacks (Prometheus, Loki, Tempo, SQL, Zabbix).

#### Coverage:
- **Dashboards & Panels**: dashboard JSON model (`schemaVersion`, `uid`, `gridPos`), panel types and `fieldConfig` overrides, transformations, query and built-in annotations, library panels, time ranges and NOC-safe refresh.
- **Template Variables**: query/datasource/custom/interval variables, chained filters, `${var:format}` interpolation options, repeat panels and rows, global variables (`$__rate_interval`, `$__range`).
- **Provisioning**: YAML schema for data sources, dashboard providers (`foldersFromFilesStructure`), plugins, and alerting resources; `$__env` / `$__file` secret interpolation; GitOps promotion patterns and drift prevention.
- **Unified Alerting**: Grafana-managed vs datasource-managed rules, expression chains (reduce, threshold, math), `for` / `keep_firing_for` / NoData handling, notification policy tree (group timings, nested branches), contact points (Slack, webhook, email), mute timings, and silences.
- **Data Sources**: UID-based addressing, `secureJsonData`, Prometheus/Loki/Tempo/SQL specifics, community plugins (Zabbix app), health checks and proxy debugging.
- **RBAC & Administration**: org roles, teams, folder permissions, service accounts and tokens, `grafana.ini` essentials, SSO mapping, high-availability deployment, and upgrade hygiene.
- **As Code**: Terraform provider resources (`grafana_folder`, `grafana_dashboard`, `grafana_rule_group`, `grafana_contact_point`, `grafana_notification_policy`, `grafana_service_account`).

---

## Adding More Skills

This repository is designed to host multiple database and engineering skills. When adding new skills (e.g. Vanilla PostgreSQL Tuning, Patroni, pgvector, or connection poolers):

1. Create a dedicated directory: `skills/<skill-name>/`
2. Define a root `SKILL.md` with standard YAML frontmatter (`name` and `description`).
3. Place architectural and runbook deep dives in `references/`.
4. Place sample manifests and configuration templates in `examples/`.

---

## Validation & CI/CD

All skills, links, and manifests are automatically validated on each commit and pull request via GitHub Actions ([validate.yml](./.github/workflows/validate.yml)) using `node scripts/validate.js`:

- **Markdown & Frontmatter**: Ensures all relative markdown links resolve correctly and all `SKILL.md` files possess valid YAML frontmatter (`name` and `description`).
- **Submodule Links**: Submodule-aware verification ensuring cross-repository submodule links resolve cleanly.

To run validation locally before committing:

```bash
node scripts/validate.js
```
