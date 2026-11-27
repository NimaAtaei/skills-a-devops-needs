# Ansible Modules & Plugin Architecture

## Modules vs. Plugins

- **Modules** ("task plugins" or "library plugins"): Executable code units transferred to and executed on the **managed node** (or run locally for API-driven modules). They accept input arguments, execute changes, and return structured JSON.
- **Plugins**: Pieces of code that execute on the **control node** to augment Ansible's core capabilities at specific points in the execution lifecycle.

---

## The 8 Major Plugin Types

### 1. Action Plugins
- **Execution**: Run on the **control node** before their counterpart module executes on the target.
- **Purpose**: Manage operations requiring control node coordination (e.g. `template` compiles Jinja2 locally before transferring; `copy` checksums local files and initiates transfer).
- **Placement**: `action_plugins/` adjacent to playbook, in roles, or collection `plugins/action/`.

### 2. Callback Plugins
- **Execution**: Run on the control node in response to runtime events (task start, task ok, task failed, play stats).
- **Categories**:
  - **`stdout`**: Controls console output (only **one** can be active at a time). Set via `stdout_callback` in `ansible.cfg` (e.g., `default`, `minimal`, `yaml`, `dense`).
  - **`aggregate`**: Emits additional information to stdout alongside the main output (e.g., `timer`, `profile_tasks`, `profile_roles`).
  - **`notification`**: Sends notifications to external monitoring, logging, or chat systems (e.g., Slack, Splunk, mail).
- **Configuration**:
  ```ini
  [defaults]
  stdout_callback = yaml
  callbacks_enabled = timer, profile_tasks, profile_roles
  ```

### 3. Connection Plugins
- **Execution**: Handles the transport communication between the control node and target host.
- **Types**: `ssh`, `paramiko_ssh`, `local`, `winrm`, `psrp`, `docker`, `podman`, `buildah`, `kubectl`.
- **Configuration**: Set globally via `transport` in `ansible.cfg`, per play with `connection:`, or per host via `ansible_connection`.

### 4. Filter Plugins
- **Execution**: Transform data within Jinja2 expressions (`{{ data | filter_name }}`). Can return any Python data type (string, list, dictionary, integer).
- **Common Built-ins**:
  - `to_json` / `from_json`
  - `to_yaml` / `from_yaml`
  - `combine` (merge dictionaries: `{{ dict_a | combine(dict_b) }}`)
  - `dict2items` / `items2dict`
  - `map(attribute='...')` / `selectattr(...)` / `rejectattr(...)`
  - `flatten` / `unique` / `intersect` / `difference`
  - `regex_search(...)` / `regex_replace(...)`
  - `b64encode` / `b64decode` / `hash('sha256')`

### 5. Lookup Plugins
- **Execution**: Run on the **control node** to retrieve external data inside templates or tasks.
- **Syntax**: `lookup('plugin_name', 'arg1', key=value)` or `query('plugin_name', ...)` (which always returns a list).
- **Common Lookups**:
  ```yaml
  # Read local file contents
  content: "{{ lookup('ansible.builtin.file', '/path/to/public_key.pub') }}"

  # Read environment variable from control node
  api_key: "{{ lookup('ansible.builtin.env', 'APP_API_KEY') }}"

  # Query external templates or YAML files
  db_pass: "{{ lookup('community.general.passwordstore', 'production/db') }}"

  # Template evaluation
  resolved: "{{ lookup('ansible.builtin.template', './config.j2') }}"
  ```
- *Note*: Lookups evaluate relative to the role/playbook directory on the control node, NOT the managed node.

### 6. Strategy Plugins
- **Execution**: Control the flow and scheduling of tasks across the host inventory.
- **Options**:
  - `linear` (default): All hosts complete task A before any host begins task B.
  - `free`: Each host executes the play as quickly as possible without waiting for other hosts.
  - `debug`: Interactive step debugger on task failure.
- **Configuration**: Set on play with `strategy: free` or in `ansible.cfg` with `strategy = linear`.

### 7. Test Plugins
- **Execution**: Evaluate conditions inside Jinja2 expressions and **always return a boolean `True` or `False`**.
- **Usage**: Used with `is` or `is not` in `when:` or `select` filters:
  ```yaml
  when:
    - var is defined
    - port is number
    - status is succeeded
    - url is match("^https://")
    - config_path is file
  ```

### 8. Vars Plugins
- **Execution**: Inject host and group variables into plays (e.g. `host_group_vars` loads `host_vars/` and `group_vars/`).
- **Configuration**: Loaded according to `vars_plugins_enabled` and `run_vars_plugins` (`demand` vs `start`).

---

## Listing & Inspecting Plugins

Use the `ansible-doc` CLI to browse and inspect any plugin type:

```bash
# List all modules
ansible-doc -l

# View module documentation, options, and examples
ansible-doc ansible.builtin.copy

# List plugins of a specific type (-t)
ansible-doc -t callback -l
ansible-doc -t lookup -l
ansible-doc -t filter -l
ansible-doc -t connection -l
ansible-doc -t strategy -l

# Inspect specific plugin details
ansible-doc -t callback timer
ansible-doc -t lookup file
```
