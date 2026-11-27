# Ansible Variables, Precedence & Special Variables

## Variable Naming & Scopes

Variable names must start with a letter and contain only letters, numbers, and underscores. Do not use Python keywords (`async`, `lambda`), playbook keywords (`environment`), or Jinja2 globals (`lookup`, `now`, `undef`).

### Scopes
1. **Global Scope**: Set via CLI options (`-e`), environment variables, or config settings.
2. **Play Scope**: Set in play `vars`, `vars_files`, `vars_prompt`, or role `defaults`.
3. **Host Scope**: Set in inventory files, `group_vars/`, `host_vars/`, fact gathering, `set_fact`, or `register`. Accessible across plays via `hostvars['hostname']`.

### Dictionary Access
```yaml
# Index syntax (Recommended; avoids collision with Python dict methods)
{{ my_dict['field_name'] }}

# Dot syntax (Collides with methods like .keys, .values, .update)
{{ my_dict.field_name }}
```

---

## Complete 22-Level Variable Precedence Hierarchy

When the same variable name is defined in multiple locations, Ansible resolves the conflict using strict precedence. The list below is ordered from **lowest precedence (1)** to **highest precedence (22)**:

| Level | Variable Source | Description / Notes |
|:-----:|-----------------|---------------------|
| **1** | Command-line values | Non-variable CLI options (e.g. `-u my_user`) |
| **2** | Role defaults | `roles/<role>/defaults/main.yml` (designed to be easily overridden) |
| **3** | Inventory file or script group vars | Inline in INI `[group:vars]` or YAML group `vars:` |
| **4** | Inventory `group_vars/all` | `./group_vars/all.yml` adjacent to inventory |
| **5** | Playbook `group_vars/all` | `./group_vars/all.yml` adjacent to playbook |
| **6** | Inventory `group_vars/*` | `./group_vars/<group>.yml` adjacent to inventory |
| **7** | Playbook `group_vars/*` | `./group_vars/<group>.yml` adjacent to playbook |
| **8** | Inventory file or script host vars | Inline in INI host definition or YAML host `vars:` |
| **9** | Inventory `host_vars/*` | `./host_vars/<host>.yml` adjacent to inventory |
| **10** | Playbook `host_vars/*` | `./host_vars/<host>.yml` adjacent to playbook |
| **11** | Host facts & cached `set_facts` | Discovered facts (`setup` module) or persistent facts |
| **12** | Play `vars` | Variables declared in the play's `vars:` block |
| **13** | Play `vars_prompt` | Variables collected interactively at runtime |
| **14** | Play `vars_files` | Variables loaded via play's `vars_files:` list |
| **15** | Role `vars` | `roles/<role>/vars/main.yml` (high precedence role variables) |
| **16** | Block `vars` | Variables defined on a `block:` (applies only to tasks in block) |
| **17** | Task `vars` | Variables defined on a task's `vars:` block (applies only to that task) |
| **18** | `include_vars` | Dynamically loaded via `ansible.builtin.include_vars` |
| **19** | `set_facts` & Registered variables | In-memory facts created via `set_fact` or `register` |
| **20** | Role (and `include_role`) parameters | Parameters passed directly to a role invocation |
| **21** | `include` parameters | Parameters passed directly to an `include_*` task |
| **22** | Extra variables (`-e` / `--extra-vars`) | **Always wins over all other sources** |

---

## Registered Variables & Return Values

Tasks capture execution results using the `register` keyword:

```yaml
- name: Run service status command
  ansible.builtin.command: /usr/local/bin/check_service.sh
  register: service_check
  failed_when: service_check.rc >= 2
  changed_when: service_check.rc == 1
```

### Common Return Keys in Registered Variables

| Key | Type | Description |
|-----|------|-------------|
| `changed` | boolean | `true` if the task modified the target state |
| `failed` | boolean | `true` if the task failed |
| `skipped` | boolean | `true` if the task was skipped due to a `when` condition |
| `msg` | string | Generic informational or error message from the module |
| `rc` | integer | Return code from commands executed by `command`, `shell`, or `raw` |
| `stdout` | string | Standard output captured from a command |
| `stdout_lines` | list of strings | Standard output split into a list of lines |
| `stderr` | string | Standard error captured from a command |
| `stderr_lines` | list of strings | Standard error split into a list of lines |
| `results` | list of dicts | Populated when the task used `loop`; contains per-item result objects |
| `diff` | dict / list | Differences before and after execution (when run with `--diff`) |
| `invocation` | dict | Details of arguments passed to the module |

---

## Special & Magic Variables

Ansible automatically injects special variables during execution:

### Inventory & Host Magic Variables
- **`inventory_hostname`**: The name/alias of the current host being processed as defined in the inventory.
- **`inventory_hostname_short`**: First component of `inventory_hostname` up to the first dot.
- **`ansible_host`**: Resolved IP or DNS target configured for the host.
- **`hostvars`**: Global dictionary containing all hosts and their exposed variables (e.g. `{{ hostvars['db1.example.com']['ansible_facts']['default_ipv4']['address'] }}`).
- **`groups`**: Dictionary of all inventory groups and the list of hostnames belonging to each (e.g. `{{ groups['webservers'] }}`).
- **`group_names`**: List of all group names the current `inventory_hostname` belongs to.

### Play & Execution Magic Variables
- **`ansible_play_hosts`**: List of all hosts active in the current play (excluding failed/unreachable hosts).
- **`ansible_play_hosts_all`**: List of all hosts targeted by the play at start.
- **`ansible_play_batch`**: List of hosts active in the current `serial` batch.
- **`playbook_dir`**: Absolute directory path of the playbook being executed.
- **`ansible_check_mode`**: Boolean; `true` if running in dry-run mode (`--check`).
- **`ansible_diff_mode`**: Boolean; `true` if running with `--diff`.
- **`ansible_version`**: Dictionary with version details (`major`, `minor`, `revision`, `full`).
- **`omit`**: Special placeholder value used to omit optional module arguments when unset:
  ```yaml
  ansible.builtin.user:
    name: "{{ item.name }}"
    uid: "{{ item.uid | default(omit) }}"
  ```

### Facts Variables
- **`ansible_facts`**: Dictionary containing all collected facts (e.g. `ansible_facts['os_family']`, `ansible_facts['default_ipv4']['address']`, `ansible_facts['distribution_major_version']`).
- **`ansible_local`**: Custom local facts populated from `/etc/ansible/facts.d/*.fact`.
