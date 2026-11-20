# Agent Skills: CloudNativePG & Database Engineering

A modular collection of specialized skills designed for AI agents (Antigravity, Claude Code, Cursor, and other agent frameworks).

## Skills Directory

### [CloudNativePG (CNPG) v1.30](./skills/cloudnative-pg/SKILL.md)
Comprehensive architecture guides, declarative configurations, and operational runbooks for running PostgreSQL clusters on Kubernetes using CloudNativePG v1.30.

#### Coverage:
- **Architecture**: PID 1 Instance Manager, Primary Lease (serialized promotion), streaming replication, quorum, and service routing.
- **Declarative Resources**: `Cluster`, `DatabaseRole` (with automated TLS client certs), `Database`, `Backup`, `ScheduledBackup`, and `Pooler` CRDs.
- **Disaster Recovery**: Barman Cloud object stores (S3/GCS/Azure/MinIO), VolumeSnapshots, Point-in-Time Recovery (PITR), and cross-region Replica Clusters.
- **Storage & Performance**: Dedicated WAL storage, online volume expansion, declarative tablespaces, and `cnpg bench` (fio & pgbench).
- **Operations & Day-2**: In-depth `kubectl cnpg` CLI cheatsheet, rolling upgrades, zero-downtime reloads, instance fencing, and troubleshooting runbooks.

---

## Adding More Skills

This repository is designed to host multiple database and engineering skills. When adding new skills (e.g. Vanilla PostgreSQL Tuning, Patroni, pgvector, or connection poolers):

1. Create a dedicated directory: `skills/<skill-name>/`
2. Define a root `SKILL.md` with standard YAML frontmatter (`name` and `description`).
3. Place architectural and runbook deep dives in `references/`.
4. Place sample manifests and configuration templates in `examples/`.
