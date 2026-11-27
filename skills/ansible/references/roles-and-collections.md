# Ansible Roles & Collections Management

## Roles: Architecture & Directory Layout

Roles provide a structured, reusable mechanism for packaging tasks, handlers, variables, defaults, templates, and files.

### Standard Role Directory Structure

```text
roles/webserver/
├── defaults/
│   └── main.yml           # Lowest precedence variables (easily overridden)
├── vars/
│   └── main.yml           # High precedence role variables
├── tasks/
│   └── main.yml           # Main task list executed by the role
├── handlers/
│   └── main.yml           # Handlers available to the role and play
├── templates/
│   └── nginx.conf.j2      # Jinja2 templates for template module
├── files/
│   └── app.tar.gz         # Static files transferred via copy/unarchive
├── meta/
│   ├── main.yml           # Role dependencies, Galaxy metadata, allow_duplicates
│   └── argument_specs.yml # Declarative argument validation spec
└── tests/
    ├── inventory
    └── test.yml
```

---

## Role Argument Validation (`meta/argument_specs.yml`)

Roles can define argument specifications validated automatically at role invocation:

```yaml
---
argument_specs:
  main:
    short_description: Deploy and configure webserver role
    description: Manages Nginx installation, TLS certificates, and vhosts.
    author: DevOps Team
    options:
      http_port:
        type: int
        default: 80
        description: Listening HTTP port
      enable_tls:
        type: bool
        default: true
        description: Whether to enable HTTPS listener
      server_name:
        type: str
        required: true
        description: Primary FQDN domain name
      allowed_ips:
        type: list
        elements: str
        default: []
        description: List of CIDR blocks allowed to access administrative endpoints
```

---

## Dynamic (`include_role`) vs. Static (`import_role`)

| Feature | Static: `roles:` / `import_role` | Dynamic: `include_role` |
|---------|-----------------------------------|-------------------------|
| **Parsing Time** | Pre-processed when playbook is loaded | Evaluated dynamically during play execution |
| **Loops** | Cannot be used with `loop:` | Fully supports `loop:` |
| **Conditionals (`when`)**| Inherited by every task individually | Evaluated on the include task itself |
| **Tags** | Inherited by all tasks in role | Tag applies only to the include task by default |
| **Handler Exposure** | Handlers parsed upfront into play scope | Handlers become available only after include runs |
| **Variable Exposure** | Role defaults/vars loaded into play scope | Hidden from outer play unless `public: true` is set |

```yaml
- name: Example Playbook Using Both Role Approaches
  hosts: webservers
  roles:
    # Static inclusion at play start
    - role: common
      tags: [base]

  tasks:
    # Static task-level import
    - name: Import security baseline
      ansible.builtin.import_role:
        name: security_baseline
      when: enforce_compliance | bool

    # Dynamic task-level include with parameters and loop
    - name: Dynamically provision multiple virtual hosts
      ansible.builtin.include_role:
        name: vhost_setup
      vars:
        vhost_name: "{{ item.name }}"
        vhost_port: "{{ item.port }}"
      loop: "{{ vhost_definitions }}"
```

---

## Ansible Collections

Collections package and distribute modules, action plugins, callback plugins, connection plugins, lookup plugins, roles, and playbooks as unified, versioned artifacts.

### Fully Qualified Collection Names (FQCN)

Always use **FQCN** to reference modules, plugins, and roles unambiguously:
- Module: `ansible.builtin.copy`, `community.general.slack`, `amazon.aws.ec2_instance`
- Filter: `{{ data | ansible.builtin.from_json }}`
- Lookup: `lookup('amazon.aws.aws_secret', 'my-secret')`
- Role: `ansible.builtin.import_role: name: my_namespace.my_collection.my_role`

### The `collections:` Keyword

The `collections:` keyword creates an ordered fallback list for **unqualified modules and action plugins** in a play or role `meta/main.yml`:

```yaml
- name: Play using collection search paths
  hosts: localhost
  collections:
    - community.general
    - amazon.aws
  tasks:
    # Resolves to community.general.slack
    - slack:
        token: "{{ slack_token }}"
        msg: "Deployment finished"
```

> **Warning**: Roles do **not** inherit the calling play's `collections:` list. If a role uses unqualified module names, declare `collections:` inside the role's `meta/main.yml`.

---

## Managing Collections with `requirements.yml`

Define dependencies in a `requirements.yml` file:

```yaml
---
# External roles
roles:
  - name: geerlingguy.docker
    version: "7.4.4"

# External collections
collections:
  # Simple collection with version range
  - name: community.general
    version: ">=9.0.0,<10.0.0"

  # Collection from custom Galaxy / Automation Hub server
  - name: custom_namespace.custom_collection
    version: "1.2.3"
    source: https://hub.internal.corp/api/galaxy/

  # Collection directly from Git
  - name: https://github.com/ansible-collections/amazon.aws.git
    type: git
    version: main

  # Collection from local directory or tarball
  - name: /opt/collections/my_vendor-my_product-1.0.0.tar.gz
    type: file
```

### Installation CLI Commands

```bash
# Install collections defined in requirements.yml
ansible-galaxy collection install -r requirements.yml

# Install collection into custom project directory
ansible-galaxy collection install community.docker -p ./collections

# Upgrade collection to latest matching version
ansible-galaxy collection install community.general --upgrade

# List installed collections
ansible-galaxy collection list

# Verify collection signatures
ansible-galaxy collection verify community.general
```
