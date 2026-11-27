# Ansible Architecture, Installation & Configuration

## Overview & Architecture

Ansible is an open-source, agentless automation engine for configuration management, application deployment, orchestration, and provisioning. It connects to managed nodes over standard transport protocols (**SSH** for POSIX/Linux systems, **WinRM / PSRP / SSH** for Windows, local APIs for network devices and cloud providers), executes temporary module payloads, and returns structured JSON output.

### Agentless Push Architecture

Unlike agent-based management systems, Ansible does not require standing client daemons or dedicated network listening ports on target nodes:
- **Control Node**: The machine where Ansible is installed and executed. Requires a UNIX-like OS (Linux, macOS, BSD; Windows is supported only via WSL). Requires Python 3.
- **Managed Nodes**: Target hosts listed in inventories. Managed nodes require an interactive POSIX shell and Python (except for network devices running API/raw commands or Windows hosts running PowerShell).
- **Transient Module Payloads**: The control node packages module arguments and utility code (`ansible.module_utils`) into compressed payloads, transfers them via SFTP/SCP/pipelining, executes them using the target's Python interpreter, collects JSON results, and removes temporary files.

```text
┌─────────────────────────────────────────────────────────────┐
│                       CONTROL NODE                          │
│                                                             │
│   ansible.cfg ──► Inventory (INI/YAML/Dynamic) ──► Playbook │
│                            │                                │
│                   Jinja2 Template Engine                    │
│                            │                                │
│                Plugins (Vars, Filter, Action)               │
│                            ▼                                │
│         Transport Layer (OpenSSH / PSRP / WinRM)            │
└──────────────┬───────────────────────────────┬──────────────┘
               │ SSH (Port 22)                 │ WinRM (5986)
               ▼                               ▼
┌──────────────────────────────┐┌─────────────────────────────┐
│      LINUX/UNIX NODE         ││        WINDOWS NODE         │
│                              ││                             │
│   /bin/sh ──► python3        ││   PowerShell 5.1+ / PSRP    │
│   (Transient JSON payload)   ││   (Transient C#/PowerShell) │
└──────────────────────────────┘└─────────────────────────────┘
```

---

## Installation & Packaging

Ansible is distributed in two primary forms:
1. **`ansible-core`**: The lightweight runtime containing the CLI utilities (`ansible`, `ansible-playbook`, `ansible-vault`, `ansible-galaxy`, etc.), the core execution engine, and the `ansible.builtin` module/plugin collection.
2. **`ansible`**: The full community package bundling `ansible-core` along with dozens of curated community and partner collections (`community.general`, `amazon.aws`, `cisco.ios`, `kubernetes.core`, etc.).

### Recommended Installation (`pipx`)

Using `pipx` isolates Ansible inside dedicated virtual environments while exposing executable binaries directly on your `$PATH`:

```bash
# Install full community package
pipx install --include-deps ansible

# Or install minimal ansible-core
pipx install ansible-core

# Pin to specific version
pipx install ansible-core==2.18.2

# Inject additional Python packages into the Ansible environment
pipx inject ansible argcomplete
pipx inject ansible pywinrm
pipx inject ansible requests

# Upgrade Ansible and all injected dependencies
pipx upgrade --include-injected ansible
```

### Installation with `pip`

```bash
# User-level installation
python3 -m pip install --user ansible

# Upgrade existing install
python3 -m pip install --upgrade --user ansible

# Install pinned version of ansible-core
python3 -m pip install --user ansible-core==2.18.2
```

### Shell Command Completion (`argcomplete`)

Ansible supports tab-completion via `argcomplete`:

```bash
# Install argcomplete into Ansible environment
pipx inject --include-apps ansible argcomplete

# Global activation (bash >= 4.2)
activate-global-python-argcomplete --user

# Or register individual tools in ~/.bashrc or ~/.zshrc
eval $(register-python-argcomplete ansible)
eval $(register-python-argcomplete ansible-playbook)
eval $(register-python-argcomplete ansible-galaxy)
eval $(register-python-argcomplete ansible-vault)
```

---

## Configuration Settings (`ansible.cfg`)

### Config File Search Precedence

Ansible searches for configuration files in the following order and **uses the first one found** (it does NOT merge settings across files):

1. `ANSIBLE_CONFIG` (environment variable path)
2. `ansible.cfg` in the current working directory (**Security note**: Ignored automatically if the current directory is world-writable)
3. `~/.ansible.cfg` (user's home directory)
4. `/etc/ansible/ansible.cfg` (system default)

### Generating & Inspecting Configuration

```bash
# Generate disabled template with all options commented out
ansible-config init --disabled > ansible.cfg

# Generate complete config including all plugin types
ansible-config init --disabled -t all > ansible.cfg

# View active configuration settings and their sources
ansible-config dump --only-changed

# View current active config file path
ansible-config view
```

### Essential `ansible.cfg` Options Reference

```ini
[defaults]
# Inventory source path or directory
inventory = ./inventory.ini

# Roles search paths (colon-separated)
roles_path = ./roles:~/.ansible/roles:/etc/ansible/roles

# Collections search paths (colon-separated)
collections_path = ./collections:~/.ansible/collections:/usr/share/ansible/collections

# Parallel worker processes (default 5; increase for large fleets)
forks = 20

# Remote SSH connection user
remote_user = automation

# Path to SSH private key file
private_key_file = ~/.ssh/id_ed25519

# SSH Host Key Checking (False disables strict host key verification)
host_key_checking = True

# Python interpreter discovery mode ('auto' discovers python3 on target)
interpreter_python = auto

# Execution strategy ('linear' or 'free')
strategy = linear

# Fact gathering behavior: 'implicit', 'explicit', or 'smart'
gathering = smart

# Fact caching backend ('memory', 'jsonfile', 'redis', 'yaml')
fact_caching = jsonfile
fact_caching_connection = ~/.ansible/cache
fact_caching_timeout = 86400

# Vault password file path
vault_password_file = ~/.ansible/vault_pass

# Callback plugins configuration
stdout_callback = default
callbacks_enabled = timer, profile_tasks, profile_roles

# Log file path (None by default)
log_path = ~/.ansible/ansible.log

# Retry files (.retry files created on play failure; False disables)
retry_files_enabled = False

[privilege_escalation]
# Enable privilege escalation (sudo/su)
become = False
become_method = sudo
become_user = root
become_ask_pass = False

[ssh_connection]
# Pipelining avoids transferring temporary files to disk; requires requiretty disabled
pipelining = True

# ControlPersist socket path and arguments
ssh_args = -C -o ControlMaster=auto -o ControlPersist=60s
control_path_dir = ~/.ansible/cp

[diff]
# Always display diff output when running in check mode or normal execution
always = False
context = 3
```
