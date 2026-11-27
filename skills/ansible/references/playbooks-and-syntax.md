# Ansible Playbooks, Syntax & Task Control

## Playbook Structure & YAML Rules

A playbook is a YAML file containing an ordered list of **plays**. Each play maps managed hosts to tasks and roles:

```yaml
---
- name: Configure Production Webservers
  hosts: webservers
  become: true
  gather_facts: true

  vars:
    http_port: 80
    max_clients: 250

  tasks:
    - name: Install Nginx package
      ansible.builtin.package:
        name: nginx
        state: present

    - name: Deploy configuration template
      ansible.builtin.template:
        src: templates/nginx.conf.j2
        dest: /etc/nginx/nginx.conf
        mode: "0644"
      notify: Reload Nginx

  handlers:
    - name: Reload Nginx
      ansible.builtin.service:
        name: nginx
        state: reloaded
```

### Critical YAML Syntax Rules

1. **Jinja2 Must Be Quoted at Value Start**: Any YAML value starting with `{{` must be quoted, or YAML parses it as an inline dictionary:
   ```yaml
   # INVALID:
   dest: {{ base_path }}/app.conf

   # VALID:
   dest: "{{ base_path }}/app.conf"
   ```
2. **Block Scalars**:
   - `|` (**Literal**): Preserves newlines and trailing formatting.
   - `>` (**Folded**): Replaces single newlines with spaces.
3. **`!unsafe` Tag**: Blocks Jinja2 template interpolation completely on raw strings containing password hashes or brace literals:
   ```yaml
   raw_secret: !unsafe "{{ not_a_variable }}%234$*"
   ```
4. **YAML Anchors (`&`), Aliases (`*`) & Merge (`<<`)**:
   ```yaml
   vars:
     default_db_settings: &db_defaults
       adapter: postgresql
       pool: 10
       timeout: 5000

     production_db:
       <<: *db_defaults
       database: prod_db
       host: db.prod.internal
   ```

---

## Play, Task & Block Keywords

- **Play Keywords**: `hosts`, `name`, `tasks`, `roles`, `pre_tasks`, `post_tasks`, `handlers`, `vars`, `vars_files`, `vars_prompt`, `become`, `become_user`, `become_method`, `gather_facts`, `gather_subset`, `serial`, `strategy`, `order`, `max_fail_percentage`, `any_errors_fatal`, `check_mode`, `diff`, `collections`, `environment`, `force_handlers`.
- **Task Keywords**: `name`, `action`, `args`, `loop`, `loop_control`, `when`, `register`, `notify`, `become`, `become_user`, `ignore_errors`, `ignore_unreachable`, `failed_when`, `changed_when`, `until`, `retries`, `delay`, `async`, `poll`, `throttle`, `timeout`, `run_once`, `delegate_to`, `delegate_facts`, `check_mode`, `diff`, `tags`, `environment`, `vars`.
- **Block Keywords**: `block`, `rescue`, `always`, `name`, `when`, `become`, `ignore_errors`, `tags`, `throttle`, `timeout`, `vars`, `delegate_to`.

---

## Loops & `loop_control`

The `loop` keyword iterates over lists of items, hashes, or complex structures.

### Basic & Filtered Loops
```yaml
# Simple list
- name: Install required packages
  ansible.builtin.package:
    name: "{{ item }}"
    state: present
  loop:
    - git
    - curl
    - htop

# Iterating over hashes with dict2items
- name: Set user parameters
  ansible.builtin.user:
    name: "{{ item.key }}"
    uid: "{{ item.value.uid }}"
    shell: "{{ item.value.shell }}"
  loop: "{{ users_dict | dict2items }}"

# Retry loop (until condition met)
- name: Wait for database service port
  ansible.builtin.wait_for:
    port: 5432
    state: started
  register: port_check
  until: port_check is succeeded
  retries: 10
  delay: 3
```

### `loop_control` Directives

```yaml
- name: Create complex users
  ansible.builtin.user:
    name: "{{ user.name }}"
    state: present
  loop: "{{ users_list }}"
  loop_control:
    loop_var: user                 # Rename 'item' to avoid collisions in nested loops
    index_var: user_idx            # Expose 0-based index
    label: "{{ user.name }}"       # Clean console output (does NOT hide secrets; use no_log)
    pause: 1                       # Seconds between iterations
    break_when: user.disabled      # Break loop when condition met (Ansible 2.18+)
```

---

## Conditionals (`when`)

Conditions use raw Jinja2 expressions **without** `{{ }}`:

```yaml
- name: Configure based on OS and architecture
  ansible.builtin.template:
    src: debian_config.j2
    dest: /etc/app.conf
  when:
    # List items evaluate with implicit AND
    - ansible_facts['os_family'] == "Debian"
    - ansible_facts['architecture'] == "x86_64"
    - (env == "prod" or env == "staging")
    - app_enabled | bool
    - service_result is succeeded
```

### Common Jinja2 Tests
- `var is defined` / `var is undefined`
- `result is failed` / `result is succeeded` / `result is skipped` / `result is changed`
- `var is match("regex")` / `var is search("regex")`
- `var is truthy` / `var is falsy`

---

## Handlers & Notification Mechanics

Handlers run only when notified by tasks reporting a changed status:

```yaml
tasks:
  - name: Update main configuration
    ansible.builtin.template:
      src: app.conf.j2
      dest: /etc/app.conf
    notify: Restart Application

  - name: Update secondary certificate
    ansible.builtin.copy:
      src: cert.pem
      dest: /etc/ssl/certs/app.pem
    notify: Restart Application

  # Force handlers to run immediately at this exact point
  - name: Flush handlers before health check
    ansible.builtin.meta: flush_handlers

  - name: Verify application endpoint
    ansible.builtin.uri:
      url: http://localhost:8080/health
      status_code: 200

handlers:
  - name: Restart Application
    ansible.builtin.service:
      name: myapp
      state: restarted
    listen: "restart-services"
```

### Handler Rules & Caveats
- **Deduplication**: A handler executes **only once per play**, regardless of how many tasks notified it.
- **Execution Order**: Handlers run in the order defined in the `handlers:` section, NOT the order they were notified.
- **Normal Execution Point**: Handlers run automatically at the end of each section (`pre_tasks`, `tasks`/`roles`, and `post_tasks`).
- **Failure Behavior**: If a task fails later in the play, notified handlers do NOT run on that host unless `force_handlers: true` is set on the play or `ansible-playbook --force-handlers` is passed.

---

## Blocks, Error Handling & Rescue

Blocks group tasks and provide structured error handling similar to `try / catch / finally`:

```yaml
- name: Database Migration Block
  block:
    - name: Run schema migration
      ansible.builtin.command: /opt/app/bin/migrate --upgrade
      register: migration_output

    - name: Verify migration status
      ansible.builtin.assert:
        that:
          - "'Migration completed' in migration_output.stdout"

  rescue:
    - name: Rollback migration on error
      ansible.builtin.command: /opt/app/bin/migrate --rollback

    - name: Report failure details
      ansible.builtin.debug:
        msg: "Task {{ ansible_failed_task.name }} failed with: {{ ansible_failed_result.msg }}"

  always:
    - name: Always clean up temporary lock file
      ansible.builtin.file:
        path: /tmp/migration.lock
        state: absent
```

### Task Error Controls
- `ignore_errors: true`: Ignores task execution failure (does NOT ignore syntax or undefined variable errors).
- `ignore_unreachable: true`: Ignores connection drops/unreachable hosts.
- `failed_when:`: Custom failure condition (e.g. `failed_when: "'CRITICAL' in result.stderr"`).
- `changed_when:`: Custom change condition (e.g. `changed_when: false` for read-only commands).
- `any_errors_fatal: true`: Aborts the entire play across all hosts if any host fails.
- `max_fail_percentage: 25`: Aborts the play if more than 25% of hosts fail in the current batch.

---

## Tags & Selective Execution

Tags allow executing or skipping specific subsets of tasks:

```yaml
tasks:
  - name: Install dependencies
    ansible.builtin.package:
      name: nginx
    tags: [packages, setup]

  - name: Sync configuration files
    ansible.builtin.template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    tags: [config]

  - name: Run debug validation
    ansible.builtin.debug:
      var: ansible_facts['default_ipv4']
    tags: [never, debug]
```

### CLI Execution
- `ansible-playbook site.yml --tags config`
- `ansible-playbook site.yml --skip-tags packages` (Skip tags always take precedence over `--tags`)
- `ansible-playbook site.yml --tags "packages,config"`
- `ansible-playbook site.yml --list-tags`

### Special Built-in Tags
- **`always`**: Task runs unless explicitly skipped with `--skip-tags always`.
- **`never`**: Task is skipped unless explicitly requested with `--tags never`.
- **`all`**: Runs all tasks without `never` (default behavior).
- **`tagged`**: Runs only tasks with at least one tag.
- **`untagged`**: Runs only tasks with no tags.
