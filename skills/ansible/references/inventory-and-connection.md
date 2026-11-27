# Ansible Inventory, Groups & Connection Details

## Inventory Architecture & Formats

Ansible tracks managed hosts, aliases, and group hierarchies using inventory sources. The default location is `/etc/ansible/hosts`, but projects standardly define inventories in project-relative paths (e.g. `./inventory.ini` or `./inventory.yaml`).

### Default Built-in Groups
Every inventory automatically provides two built-in groups:
- **`all`**: Contains every host defined in the inventory.
- **`ungrouped`**: Contains all hosts that do not belong to any user-defined group other than `all`.

---

## INI Inventory Format

The INI format uses section headers for groups, `:children` for parent-child groups, and `:vars` for group-level variables.

```ini
# Ungrouped hosts
db1.example.com
db2.example.com

# Explicit group with numeric range (inclusive, stride 2)
[webservers]
web[01:10].example.com
web[11:20:2].example.com ansible_port=2222

# Alphabetic range
[databases]
db-[a:d].example.com

# Host aliases with connection parameters
[loadbalancers]
lb1 ansible_host=192.168.1.10 ansible_port=22
lb2 ansible_host=192.168.1.11 ansible_port=22

# Group nesting via :children
[production:children]
webservers
databases
loadbalancers

# Group variables (parsed as strings in INI)
[webservers:vars]
http_port=80
max_clients=200
```

---

## YAML Inventory Format

YAML inventory avoids INI type ambiguity and natively handles booleans, lists, and nested dictionaries:

```yaml
---
all:
  hosts:
    bastion.example.com:
      ansible_host: 198.51.100.1
      ansible_user: jumpuser

  children:
    webservers:
      hosts:
        web01.example.com:
          ansible_host: 10.0.1.10
        web02.example.com:
          ansible_host: 10.0.1.11
      vars:
        http_port: 80
        enable_ssl: true
        backend_pool:
          - 10.0.2.10
          - 10.0.2.11

    databases:
      hosts:
        db-[a:c].example.com:
      vars:
        db_port: 5432

    production:
      children:
        webservers:
        databases:
      vars:
        env: prod
```

---

## Multiple Inventory Sources & Directories

- **CLI Multiple Sources**: Passing `-i` multiple times merges inventory sources in CLI order:
  ```bash
  ansible-playbook site.yml -i inventory/staging -i inventory/dynamic_aws.yml
  ```
- **Inventory Directory**: Passing a directory path reads all files in alphabetical order. Files can be prefixed (`01-static.ini`, `02-dynamic.yaml`) to control evaluation order.
- **Single Host Ad-Hoc Shorthand**: A trailing comma tells Ansible to treat an argument as a direct host list rather than a file path:
  ```bash
  ansible all -i "192.168.1.50," -m ping
  ```

---

## `host_vars` and `group_vars` Directory Hierarchy

Instead of inlining variables in inventory files, organize variables in dedicated directories adjacent to your inventory or playbook directory:

```text
inventory/
├── hosts.ini
├── group_vars/
│   ├── all.yml                 # Variables applied to every host
│   ├── webservers.yml          # Variables applied to the webservers group
│   └── databases/              # Groups can also be subdirectories of files
│       ├── db_settings.yml
│       └── replication.yml
└── host_vars/
    ├── web01.example.com.yml   # Specific variables for web01
    └── db-a.example.com.yml    # Specific variables for db-a
```

- **Resolution Precedence**: Playbook-adjacent `group_vars/` overrides inventory-adjacent `group_vars/`.
- **Group Variable Merging**: Same-level group variables merge alphabetically (last wins) unless overridden by setting `ansible_group_priority` in the inventory source (default `1`; higher priority wins).

---

## Behavioral Connection Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ansible_connection` | `ssh` | Connection plugin (`ssh`, `local`, `winrm`, `psrp`, `docker`, `podman`) |
| `ansible_host` | `inventory_hostname` | Actual IP or DNS address to connect to |
| `ansible_port` | `22` (SSH) / `5986` (WinRM) | Destination port |
| `ansible_user` | Control node user | Login user on managed node |
| `ansible_password` | `None` | Login password (use Ansible Vault) |
| `ansible_ssh_private_key_file` | `None` | Path to SSH private key |
| `ansible_ssh_common_args` | `None` | Extra SSH arguments (e.g. ProxyJump / ProxyCommand) |
| `ansible_ssh_pipelining` | `ansible.cfg` | Enable/disable OpenSSH pipelining per host |
| `ansible_become` | `False` | Enable privilege escalation for host |
| `ansible_become_method` | `sudo` | Escalation method (`sudo`, `su`, `pbrun`, `doas`, `runas`) |
| `ansible_become_user` | `root` | Target user for privilege escalation |
| `ansible_become_password` | `None` | Escalation password (use Ansible Vault) |
| `ansible_python_interpreter` | `auto` | Target host Python executable path |
| `ansible_shell_type` | `sh` | Shell type (`sh`, `bash`, `powershell`, `cmd`, `csh`, `fish`) |

---

## Host Patterns & Targeting Syntax

Patterns target hosts in ad-hoc CLI commands or the `hosts:` line of a play:

| Pattern | Meaning | Example |
|---------|---------|---------|
| `all` or `*` | All hosts in inventory | `ansible all -m ping` |
| `host1` | Single host name or alias | `ansible web01 -m ping` |
| `web:db` or `web,db` | Union (Logical OR) | `hosts: webservers,databases` |
| `web:!atlanta` | Exclusion (Logical NOT) | `hosts: webservers:!atlanta` |
| `web:&staging` | Intersection (Logical AND) | `hosts: webservers:&staging` |
| `192.168.1.*` | Wildcard match | `hosts: 10.0.*:!10.0.1.5` |
| `webservers[0]` | Slicing: first host in group | `hosts: webservers[0]` |
| `webservers[0:2]` | Slicing: items 0, 1, 2 (inclusive) | `hosts: webservers[0:2]` |
| `webservers[1:]` | Slicing: from index 1 to end | `hosts: webservers[1:]` |
| `~(web\|db).*\.prod` | Regular expression (starts with `~`) | `hosts: ~(web|app).*\.example\.com` |
| `web:!{{ excluded }}` | Pattern with Jinja2 variables | `hosts: webservers:!{{ maintenance_host }}` |

- **Evaluation Order**: Logical OR (`:` or `,`) evaluates first, then intersection (`&`), then exclusion (`!`).
- **Limiting at Runtime**: Restrict any execution using `--limit` (e.g., `ansible-playbook site.yml --limit "webservers:&production:!web01"`).
