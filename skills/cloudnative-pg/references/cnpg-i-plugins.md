# CNPG-I (CloudNativePG Interface) & Plugin Ecosystem (v1.30)

## 1. What is CNPG-I?

**CNPG-I** (CloudNativePG Interface) is an open, standard gRPC-based plugin specification modeled after Kubernetes CSI (Container Storage Interface) and CNI (Container Network Interface).

It allows external systems and vendors to hook into CloudNativePG without modifying the upstream operator code.

```text
┌─────────────────────────────────┐
│     CloudNativePG Operator      │
│  (or Pod Instance Manager)      │
└────────────────┬────────────────┘
                 │ gRPC over Unix Domain Socket
                 ▼
┌─────────────────────────────────┐
│         CNPG-I Plugin           │
│  - Backup & Restore Hooks       │
│  - Replication Integrations     │
│  - Custom Sub-Resource Handlers │
└─────────────────────────────────┘
```

---

## 2. Supported Plugin Capabilities

CNPG-I defines distinct gRPC service contracts:
- **Identity Service**: Reports plugin metadata, supported API versions, and capabilities.
- **Operator Lifecycle Service**: Hooks executed during cluster reconciliation, mutation, and validation.
- **Instance Manager Service**: Hooks executed on individual PostgreSQL pod startup, failover, backup, and shutdown.
- **Backup & Recovery Plugins**: Custom backup target drivers (e.g., enterprise storage appliances, specialized deduplication engines).

---

## 3. Plugin Deployment Models

Plugins can be deployed in two topologies:

### A. Sidecar Container in the Operator Deployment
- Runs as an auxiliary container alongside the CNPG operator container.
- Communicates via a shared Unix Domain Socket volume mount (`/plugin`).
- Preferred for operator-level extensions and admission hooks.

### B. Standalone Pod / DaemonSet
- Runs as an independent service in the same Kubernetes namespace or on each node.
- Communicates via network gRPC endpoints with mTLS.

---

## 4. The Barman Cloud Plugin Shift

Starting in recent CNPG releases and continuing through 1.30, in-tree Barman Cloud backup code is being decoupled in favor of the **Barman Cloud Plugin** built on CNPG-I:
- **Decoupling**: Separates backup release cadences from core operator releases.
- **Preparation for 1.31**: CloudNativePG plans to deprecate native in-tree Barman Cloud code in version 1.31. Users are encouraged to prepare plugin manifests for future major releases.
