# Agent Skills Repository Guidelines

This repository is a modular collection of specialized skills designed for AI agents (such as Antigravity, Claude Code, Cursor, and other agent frameworks).

## Repository Architecture

Skills are organized under the `skills/` directory. Each skill follows standard progressive disclosure conventions:

```text
skills/<skill-name>/
├── SKILL.md            # Required: Skill entrypoint with YAML frontmatter
├── references/         # In-depth architectural, configuration, and troubleshooting guides
└── examples/           # Production-ready manifests, code snippets, or templates
```

## Available Skills

- **[cloudnative-pg](./skills/cloudnative-pg/SKILL.md)**: CloudNativePG (PostgreSQL operator for Kubernetes) v1.30 architecture, declarative roles, HA clustering, Barman Cloud backups, PITR, PgBouncer pooling, and operational CLI runbooks.
- **[gitlab-ci](./skills/gitlab-ci/SKILL.md)**: GitLab CI/CD authoring, debugging, validation, and pipeline optimization (added via Git submodule tracking `main`).

## Contributing / Adding New Skills

When adding future skills (including additional PostgreSQL skills):

1. Create a dedicated directory under `skills/<skill-name>/`.
2. Include a valid `SKILL.md` with YAML frontmatter containing `name` and `description`.
3. Separate conceptual deep-dives into `references/` and manifests/snippets into `examples/`.
4. Validate that all relative markdown links resolve correctly.
