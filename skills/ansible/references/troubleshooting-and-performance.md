# Ansible Performance Tuning, Scalability & Troubleshooting

## Performance & Optimization Knobs

### 1. Parallel Worker Forks (`forks`)
By default, Ansible runs with only **5 forks**. On modern control machines managing dozens or hundreds of nodes, raise this in `ansible.cfg` or CLI:
```ini
[defaults]
forks = 30
```
Or at runtime: `ansible-playbook site.yml -f 30`.

### 2. SSH Pipelining (`pipelining`)
SSH pipelining reduces the number of network connections by streaming Python modules directly to the interpreter's stdin without copying intermediate files to disk:
```ini
[ssh_connection]
pipelining = True
```
> **Caveat**: Pipelining requires that `requiretty` is disabled in `/etc/sudoers` on managed nodes.

### 3. Fact Caching
Gathering facts on every play adds substantial latency. Cache facts to disk or memory stores:
```ini
[defaults]
gathering = smart
fact_caching = jsonfile
fact_caching_connection = ~/.ansible/cache
fact_caching_timeout = 86400
```

### 4. SSH ControlMaster & ControlPersist
Reuses open SSH connections across multiple tasks for the same host:
```ini
[ssh_connection]
ssh_args = -C -o ControlMaster=auto -o ControlPersist=120s
```

---

## Asynchronous Actions & Polling (`async` / `poll`)

Long-running operations (database backups, package builds) can run asynchronously to prevent SSH timeout disconnects:

### Synchronous Async (`poll > 0`)
Blocks the playbook execution while polling periodically until complete:
```yaml
- name: Run lengthy database indexing
  ansible.builtin.command: /usr/local/bin/reindex_db.sh
  async: 3600    # Maximum time allowed (seconds)
  poll: 30       # Check every 30 seconds
```

### Fire-and-Forget Async (`poll: 0`)
Starts tasks concurrently across hosts and checks status later:
```yaml
- name: Start long backup job in background
  ansible.builtin.command: /usr/local/bin/backup.sh
  async: 1800
  poll: 0
  register: backup_job

- name: Do other tasks while backup runs
  ansible.builtin.debug:
    msg: "Doing other configuration tasks..."

- name: Wait for backup job to finish
  ansible.builtin.async_status:
    jid: "{{ backup_job.ansible_job_id }}"
  register: job_result
  until: job_result.finished
  retries: 60
  delay: 15
```

---

## Rolling Updates & Batch Control

Control how many hosts execute tasks concurrently using `serial`:

```yaml
- name: Rolling update application cluster
  hosts: webservers
  serial: 3                   # Process 3 hosts at a time
  # Or percentage: serial: "25%"
  # Or phased batches: serial: [1, 5, "20%"]
  max_fail_percentage: 10     # Abort if >10% of hosts in batch fail

  tasks:
    - name: Drain node from load balancer
      ansible.builtin.command: /usr/local/bin/lb_drain.sh {{ inventory_hostname }}
      delegate_to: lb1.internal

    - name: Upgrade application package
      ansible.builtin.package:
        name: myapp
        state: latest
      notify: Restart myapp

    - name: Flush handlers before re-enabling
      ansible.builtin.meta: flush_handlers

    - name: Re-enable node in load balancer
      ansible.builtin.command: /usr/local/bin/lb_enable.sh {{ inventory_hostname }}
      delegate_to: lb1.internal
```

---

## Troubleshooting & Debugging Runbooks

### 1. CLI Diagnostic Flags
```bash
# Syntax verification without connecting to hosts
ansible-playbook site.yml --syntax-check

# Dry-run execution (check mode)
ansible-playbook site.yml -C --diff

# Step-by-step interactive execution
ansible-playbook site.yml --step

# Start execution at a specific task
ansible-playbook site.yml --start-at-task="Deploy configuration template"

# Increased verbosity
ansible-playbook site.yml -v    # Shows task results
ansible-playbook site.yml -vv   # Shows task setup and options
ansible-playbook site.yml -vvv  # Shows SSH commands and connection details
ansible-playbook site.yml -vvvv # Shows connection plugin debugging
```

### 2. Task Debugger (`debugger:`)
Invoke the interactive Python/Ansible debugger on failure:
```yaml
- name: Play with task debugging
  hosts: all
  debugger: on_failed   # always | never | on_failed | on_unreachable
  tasks:
    - name: Risky task
      ansible.builtin.command: /bin/false
```
Inside the debugger:
- `p task_vars`: Print available variables
- `p task.args`: Print task arguments
- `task.args['key'] = 'new_val'`: Mutate argument
- `redo`: Re-execute task with modified arguments
- `c` (continue): Proceed to next task

---

## Ad-Hoc CLI Command Cheatsheet

```bash
# Ping all hosts
ansible all -m ping

# Run shell command with privilege escalation
ansible webservers -b -m shell -a "uptime && free -m"

# Install package across specific group
ansible databases -b -m package -a "name=postgresql-server state=present"

# Restart a service
ansible webservers -b -m service -a "name=nginx state=restarted"

# Transfer file
ansible all -m copy -a "src=/etc/motd dest=/etc/motd mode=0644"

# Gather specific fact subset
ansible web01 -m setup -a "filter=ansible_default_ipv4"
```
