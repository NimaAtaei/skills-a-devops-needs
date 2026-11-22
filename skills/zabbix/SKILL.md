---
name: zabbix
description: >
  Zabbix enterprise monitoring — server/proxy/agent architecture, item types and
  value preprocessing, trigger expressions and functions, templates and macro
  inheritance, problem/event lifecycle and correlation, actions with escalation
  chains and media types (including webhook integrations), JSON-RPC API, proxy
  scaling and server HA, housekeeper and performance tuning, and operational
  best practices for Zabbix 7.0/8.0 LTS.
---

# Zabbix Monitoring & Alerting

Comprehensive reference for operating Zabbix at scale: architecture, data
collection (items), trigger logic, template/macro design, alerting and escalation,
the JSON-RPC API, distributed proxying, and operational best practices.

## When to Use This Skill

Activate when the task involves:

- Sizing or debugging the **Zabbix server** — processes, caches, HA pairs, database
  growth, housekeeper
- Designing **items** — item types, keys, preprocessing pipelines, LLD discovery,
  dependent items, user parameters
- Writing **trigger expressions** — `/host/key` function syntax, `nodata`, windowed
  functions, trigger dependencies and event correlation
- Building or customizing **templates** — inheritance, LLD macros, user and secret
  macros, tags
- Configuring **actions and escalations** — conditions, operation steps, media types,
  webhook media type scripts (n8n/SMS gateways), message templates
- Automating with the **JSON-RPC API** (`api_jsonrpc.php`) — token auth, problem/event
  queries, acknowledgements, template export/import
- Deploying **proxies** — active vs passive, buffer modes, proxy groups/HA, agent2
  configuration, TLS/PSK
- Tuning for scale — NVPS capacity, TimescaleDB, cache sizes, queue monitoring

## Reference Docs

| Document | Covers |
|----------|--------|
| [Architecture & Components](references/architecture-and-components.md) | Server/agent/agent2/proxy/frontend/database, server HA, internal processes, config essentials |
| [Items & Data Collection](references/items-and-data-collection.md) | Item types, key syntax, preprocessing pipelines, LLD, dependent items, user parameters |
| [Triggers & Events](references/triggers-and-events.md) | Expression syntax and functions, severities, dependencies, correlation, problem lifecycle, services |
| [Templates & Macros](references/templates-and-macros.md) | Template inheritance, official templates, LLD macros, user/secret/context macros, tags strategy |
| [Actions & Alerting](references/actions-and-alerting.md) | Action conditions/operations, escalation chains, media types, webhook JavaScript, message templates |
| [API](references/api.md) | JSON-RPC auth with tokens/Bearer, key methods, filters/pagination, acknowledgements, export/import, automation patterns |
| [Proxies & Scale](references/proxies-and-scale.md) | Active/passive proxies, memory buffering, proxy groups/HA, housekeeper, TimescaleDB, cache/process tuning |
| [Best Practices](references/best-practices.md) | Naming conventions, symptom-based triggers, tag routing, maintenance windows, capacity planning, upgrade path |

## Example Configurations

| Example | Purpose |
|---------|---------|
| [userparameter-examples.conf](examples/userparameter-examples.conf) | Custom agent checks on Linux and Windows (agent/agent2 compatible) |
| [webhook-mediatype-n8n.js](examples/webhook-mediatype-n8n.js) | Webhook media type JavaScript forwarding problems to an n8n automation endpoint |
| [template-linux-custom-health.yaml](examples/template-linux-custom-health.yaml) | Minimal template YAML export (v7.0) with items, triggers, and tags |
| [api-examples.sh](examples/api-examples.sh) | curl JSON-RPC flows: token login, problem queries, acknowledgements, template export |
| [proxy-and-agent-config.conf](examples/proxy-and-agent-config.conf) | Production-style `zabbix_proxy.conf` and `zabbix_agent2.conf` snippets with TLS/PSK |
| [escalation-action.yaml](examples/escalation-action.yaml) | Action YAML export implementing a multi-step escalation ladder |
