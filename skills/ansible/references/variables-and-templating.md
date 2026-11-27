# Ansible Variables, Precedence, Loops & Templating

## Variable Scopes

Ansible variables exist in three main scopes:
1. **Global**: Defined via configuration, environment variables, or CLI extra vars (`-e`). Extra vars are global and available across all plays and `hostvars`.
2. **Play**: Defined in play `vars:`, `vars_files:`, `vars_prompt:`, or role `defaults/`. Exists only within the defining play.
3. **Host**: Defined in inventory, `host_vars/`, `group_vars/`, registered variables, or facts. Accessible across all plays via `hostvars['hostname']`.

---

## The Complete 22-Level Variable Precedence Hierarchy

When variables of the same name are defined in multiple locations, Ansible resolves them using this exact hierarchy (from **lowest (1)** to **highest (22)** precedence):

1. Command-line values (e.g., `-u my_user`; not variables)
2. Role defaults (`roles/<role>/defaults/main.yml`)
3. Inventory file or script group vars
4. Inventory `group_vars/all`
5. Playbook `group_vars/all`
6. Inventory `group_vars/*`
7. Playbook `group_vars/*`
8. Inventory file or script host vars
9. Inventory `host_vars/*`
10. Playbook `host_vars/*`
11. Host facts and cached `set_facts`
12. Play `vars`
13. Play `vars_prompt`
14. Play `vars_files`
15. Role `vars` (`roles/<role>/vars/main.yml`)
16. Block `vars` (for tasks inside the block only)
17. Task `vars` (for the task only)
18. `include_vars`
19. Registered vars and `set_facts`
20. Role (and `include_role`) parameters
21. `include` parameters
22. Extra vars (`-e "key=value"`) — **always wins**

---

## Variable Registration & Projections

Capture task output with `register:`:

```yaml
- name: Run health check
  ansible.builtin.uri:
    url: "http://localhost:8080/health"
    status_code: 200
  register: health_result
  failed_when: health_result.status != 200

# Using Register Projections (Ansible 2.21+)
- name: Query database and extract fields directly
  ansible.builtin.command: /usr/local/bin/query_db.sh
  register:
    raw_status: _task.result.rc
    output_lines: _task.result.stdout_lines
```

---

## Loops & Iteration (`loop`, `loop_control`, `until`)

### Standard Loop Syntax

```yaml
- name: Create required application users
  ansible.builtin.user:
    name: "{{ item.name }}"
    uid: "{{ item.uid }}"
    groups: "{{ item.groups }}"
    state: present
  loop:
    - { name: 'deploy', uid: 2001, groups: 'wheel' }
    - { name: 'app', uid: 2002, groups: 'app' }
  loop_control:
    label: "{{ item.name }}" # Cleans up verbose console output
    pause: 1                # Pause 1 second between iterations
```

### `loop_control` Directives
- **`label`**: Customizes the string printed per item in stdout (reduces clutter).
- **`loop_var`**: Renames the default `item` variable (essential when nesting loops).
- **`index_var`**: Exposes the 0-based loop index variable name.
- **`pause`**: Number of seconds to pause between iterations.
- **`break_when`**: Jinja2 conditional expression to break out of the loop early.
- **`extended: true`**: Exposes the `ansible_loop` tracking dictionary (`index`, `first`, `last`, `length`, `previtem`, `nextitem`).

### Retries with `until`

```yaml
- name: Wait for service port to open
  ansible.builtin.uri:
    url: "http://127.0.0.1:8080/ready"
  register: endpoint_status
  until: endpoint_status.status == 200
  retries: 12
  delay: 5
```

### Migrating Legacy `with_*` to Modern `loop`
- `with_items: "{{ items }}"` -> `loop: "{{ items | flatten(levels=1) }}"`
- `with_dict: "{{ dict_data }}"` -> `loop: "{{ dict_data | dict2items }}"` (`item.key`, `item.value`)
- `with_fileglob: "*.conf"` -> `loop: "{{ query('fileglob', '*.conf') }}"`
- `with_subelements: [ "{{ users }}", "authorized_keys" ]` -> `loop: "{{ users | subelements('authorized_keys') }}"`

---

## Conditionals (`when`)

Conditions are written in raw Jinja2 expressions **without** `{{ }}`:

```yaml
- name: Restart service conditionally
  ansible.builtin.service:
    name: postgresql
    state: restarted
  when:
    - db_installed is succeeded
    - ansible_facts['os_family'] == 'RedHat'
    - ansible_facts['distribution_major_version'] | int >= 9
    - not (is_maintenance_window | bool)
```

> **List syntax**: Multiple lines under `when:` represent a logical **AND**. Use explicit `or` and parentheses inside a single expression for logical **OR**.

---

## Special Variables & Facts

### Magic Variables
- **`inventory_hostname`**: The current host name as configured in inventory.
- **`inventory_hostname_short`**: First component of `inventory_hostname` before the first dot.
- **`hostvars`**: Access variables and facts of other hosts: `hostvars['db1.example.com']['ansible_facts']['default_ipv4']['address']`.
- **`groups`**: Dictionary of all groups and their member hosts: `groups['webservers']`.
- **`group_names`**: List of groups the current host belongs to.
- **`ansible_play_hosts`**: List of all hosts active in the current play.
- **`ansible_play_batch`**: Hosts currently active in the current `serial` batch.
- **`ansible_check_mode`**: Boolean (`True` if running with `--check`).
- **`omit`**: Special placeholder to omit an optional argument if a variable is undefined:
  ```yaml
  mode: "{{ custom_mode | default(omit) }}"
  ```

### Facts (`ansible_facts`)
Access gathered facts via namespaced dictionary:
- `ansible_facts['os_family']` (`RedHat`, `Debian`, `Archlinux`)
- `ansible_facts['distribution']` (`Ubuntu`, `CentOS`, `Fedora`, `Rocky`)
- `ansible_facts['distribution_major_version']`
- `ansible_facts['default_ipv4']['address']`
- `ansible_facts['memtotal_mb']`
- `ansible_facts['processor_vcpus']`
