# Ansible Performance Optimization & Troubleshooting

## Performance Optimization Knobs

### 1. SSH Pipelining (`pipelining = True`)
By default, Ansible copies a temporary Python module script to the remote host via SFTP/SCP, executes it via SSH, and cleans it up. **Pipelining** executes the module directly via stdin inside the SSH stream without copying files:
```ini
# ansible.cfg
[ssh_connection]
pipelining = True
```
> **Requirement**: Managed nodes must **not** require `requiretty` in `/etc/sudoers`.

### 2. Concurrency & Worker Scaling (`forks`)
Ansible defaults to only `5` parallel forks. For environments with 20+ nodes, increase `forks`:
```ini
[defaults]
forks = 30
```

### 3. SSH Multiplexing (`ControlPersist`)
Maintains persistent master sockets to avoid repeated TCP/SSH handshakes:
```ini
[ssh_connection]
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o PreferredAuthentications=publickey
control_path_dir = ~/.ansible/cp
```

### 4. Smart Fact Gathering & Caching
Avoid re-running `setup` on every play by using persistent fact caching:
```ini
[defaults]
gathering = smart
fact_caching = jsonfile
fact_caching_connection = ~/.ansible/cache
fact_caching_timeout = 86400
```
In playbooks where facts are not required:
```yaml
- name: Lightweight play without facts
  hosts: all
  gather_facts: false
```

### 5. Asynchronous Execution (`async` and `poll`)
Run long-running tasks concurrently or in the background:
```yaml
- name: Run database reindex asynchronously
  ansible.builtin.command: /usr/local/bin/reindex.sh
  async: 3600
  poll: 0 # Fire and forget
  register: reindex_job

- name: Check status later
  ansible.builtin.async_status:
    jid: "{{ reindex_job.ansible_job_id }}"
  register: job_result
  until: job_result.finished
  retries: 60
  delay: 10
```

---

## Troubleshooting & Debugging

### Verbosity Levels
- `-v`: Displays task results and return values.
- `-vv`: Displays task configuration and inputs.
- `-vvv`: Displays connection and authentication details.
- `-vvvv`: Displays full SSH/WinRM command output, script transfers, and plugin traces.

### The Ansible Task Debugger (`debugger:`)
Ansible includes an interactive task debugger:

```yaml
- name: Task with interactive debugger on failure
  ansible.builtin.template:
    src: app.conf.j2
    dest: /etc/app.conf
  debugger: on_failed
```

**Debugger Commands**:
- `p task.args` — Print current task arguments.
- `p task_vars['var_name']` — Print a variable's value.
- `task.args['dest'] = '/tmp/test.conf'` — Modify task arguments on the fly.
- `redo` — Re-execute the task with modified state.
- `continue` — Continue playbook execution.

---

## Symptom Library & Common Issues

| Symptom | Probable Cause | Solution |
|---------|----------------|----------|
| **`UNREACHABLE: Connection refused`** | SSH daemon down or wrong port | Verify `ansible_port` and network firewalls. |
| **`UNREACHABLE: Permission denied (publickey)`** | Missing or incorrect SSH key | Test `ssh -i <key> <user>@<host>`; verify `ansible_user` and `ansible_ssh_private_key_file`. |
| **`sudo: a password is required`** | Sudo requires a password not provided | Use `-K` / `--ask-become-pass` or configure passwordless sudo in `/etc/sudoers`. |
| **`Syntax Error while loading YAML`** | Unquoted Jinja2 template starting with `{{` | Wrap the entire value in quotes: `dest: "{{ my_path }}"`. |
| **`Variable is undefined`** | Variable out of scope or typo | Check variable precedence hierarchy; use `| default('fallback')`. |
| **`Failed to set permissions on the temporary files`** | Remote user cannot access `/tmp` or ACLs issue | Set `remote_tmp = ~/.ansible/tmp` or configure POSIX ACLs on managed nodes. |
| **`winrm: Authentication failure`** | WinRM credentials or transport mismatch | Check `ansible_winrm_transport`, verify `LocalAccountTokenFilterPolicy`. |
| **`ModuleNotFoundError: No module named 'boto3'`** | Python library missing in Ansible's interpreter | Check `ansible_python_interpreter`; install packages into that specific Python environment. |
