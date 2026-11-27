---
name: ansible
description: >
  Ansible automation platform and core orchestration — playbooks, roles, collections,
  inventories (INI/YAML/dynamic), 22-level variable precedence, loops, conditionals, handlers,
  blocks/rescue error handling, Ansible Vault secrets management, execution environments (EE),
  Windows management (WinRM/PSRP/SSH), plugin types, and performance tuning (forks, pipelining, async).
---

# Ansible Automation Platform & Core Orchestration

Comprehensive reference for Ansible and `ansible-core`: architecture, configuration (`ansible.cfg`), inventory management, playbook syntax, variable precedence, roles, collections, modules and plugins, secrets management with Ansible Vault, containerized Execution Environments (EE), Windows host automation, and operational troubleshooting runbooks.

## When to Use This Skill

Activate when the task involves:

- Authoring or refactoring **Ansible playbooks** (`tasks:`, `roles:`, `pre_tasks:`, `post_tasks:`)
- Creating or structuring **Ansible roles** (`defaults/`, `vars/`, `tasks/`, `handlers/`, `templates/`, `meta/argument_specs.yml`)
- Managing **Ansible collections** (`ansible-galaxy collection install`, `requirements.yml`, FQCN resolution)
- Designing **inventories** in INI or YAML with host ranges, parent/child groups (`:children`), and `host_vars`/`group_vars`
- Troubleshooting **variable precedence** across Ansible's 22 levels, registered variables, or special/magic variables
- Implementing **task control**: loops (`loop:`, `loop_control:`), conditionals (`when:`), handlers (`notify:`, `listen:`, `meta: flush_handlers`), blocks (`block:`, `rescue:`, `always:`)
- Encrypting secrets with **Ansible Vault** (`ansible-vault create/edit/encrypt/decrypt/rekey/encrypt_string`, `--vault-id`, password client scripts)
- Packaging and running **Execution Environments (EE)** with `execution-environment.yml` v3, `ansible-builder`, and `ansible-navigator`
- Managing **Windows targets** via WinRM, PSRP, or OpenSSH with PowerShell modules (`ansible.windows`, `community.windows`)
- Tuning execution performance with `forks`, OpenSSH `pipelining`, `fact_caching`, `serial` batching, or `async`/`poll`

## Reference Docs

| Document | Covers |
|----------|--------|
| [Architecture & Configuration](references/architecture-and-config.md) | Control/managed node architecture, `pipx`/`pip` installation, `ansible.cfg` precedence, options reference, and `ansible-config` CLI |
| [Inventory & Connection](references/inventory-and-connection.md) | INI and YAML inventories, ranges, group nesting (`:children`), `host_vars`/`group_vars` hierarchy, connection variables (`ansible_connection`, `ansible_host`), and host pattern syntax |
| [Playbooks & Syntax](references/playbooks-and-syntax.md) | YAML formatting rules, play/task/block keywords, loops and `loop_control`, conditionals (`when`), handlers (`notify`/`listen`), blocks/rescue/always, and tags (`always`/`never`) |
| [Variables & Precedence](references/variables-and-precedence.md) | Complete 22-level variable precedence hierarchy, dictionary syntax, registered variables, return values (`changed`, `failed`, `rc`), and special/magic variables |
| [Roles & Collections](references/roles-and-collections.md) | Standard role layout, `meta/argument_specs.yml` validation, static (`import_role`) vs dynamic (`include_role`), FQCN resolution, `collections:` keyword, and `requirements.yml` |
| [Modules & Plugins](references/modules-and-plugins.md) | Modules vs plugins, 8 major plugin types (Action, Callback, Connection, Filter, Lookup, Strategy, Test, Vars), plugin discovery, and `ansible-doc` |
| [Vault & Secrets](references/vault-and-security.md) | File vs variable encryption (`!vault \|`), `ansible-vault` CLI commands, `--vault-id` labels, multi-vault passwords, and automated client scripts |
| [Execution Environments](references/execution-environments.md) | EE architecture, `execution-environment.yml` v3 schema, `ansible-builder` builds, and running with `ansible-navigator` |
| [Windows & Transports](references/windows-and-transport.md) | Windows requirements, PSRP vs WinRM vs OpenSSH, authentication modes (Basic, NTLM, Kerberos, CredSSP, Certificate), and PowerShell modules |
| [Troubleshooting & Performance](references/troubleshooting-and-performance.md) | `forks`, OpenSSH pipelining, fact caching, asynchronous tasks (`async`/`poll`), rolling updates (`serial`), task debugger, and ad-hoc CLI commands |

## Example Configurations

| Example | Purpose |
|---------|---------|
| [ansible.cfg](examples/ansible.cfg) | Production configuration: forks, pipelining, fact caching, callback profiling, and ControlPersist |
| [inventory.ini](examples/inventory.ini) | Production INI inventory: host ranges, host aliases, group variables, and nested child groups |
| [inventory.yaml](examples/inventory.yaml) | Structured YAML inventory: environment hierarchy, typed variables, and connection settings |
| [requirements.yml](examples/requirements.yml) | Multi-collection and role dependencies specification for `ansible-galaxy` |
| [execution-environment.yml](examples/execution-environment.yml) | Execution Environment v3 definition: base image, system packages, pip libraries, and collections |
| [playbook-production-site.yml](examples/playbook-production-site.yml) | Multi-play production playbook: OS assertions, phased serial rollout, role execution, and post-task health checks |
| [playbook-vault-and-async.yml](examples/playbook-vault-and-async.yml) | Asynchronous task execution (`async`/`poll: 0`), vault scalar decryption, and block/rescue/always error handling |
| [role-webserver](examples/role-webserver/) | Complete modular role: `meta/argument_specs.yml`, defaults, tasks, handlers, and Jinja2 templates |
