# Ansible Execution Environments (EE)

## Overview & Architecture

An **Execution Environment (EE)** is an OCI-compliant container image (built with Podman or Docker) that packages everything needed to run an Ansible automation workload:
- `ansible-core`
- `ansible-runner` (orchestration execution wrapper)
- Python interpreter and required Python dependencies
- System/OS package dependencies (`openssh-clients`, `krb5-libs`, etc.)
- Ansible Collections and their requirements

### Why Execution Environments?
- **Portability**: Guarantees identical execution between developer laptops, CI/CD pipelines, and AWX / Ansible Automation Platform.
- **Dependency Isolation**: Prevents dependency conflicts between different collections requiring different Python library versions.
- **Zero Control Node Drift**: Eliminates the need to maintain hundreds of Python packages and tools on shared control servers.

---

## Ecosystem Tooling

- **`ansible-builder`**: CLI tool that consumes an `execution-environment.yml` definition file and builds container images.
- **`ansible-navigator`**: Terminal user interface (TUI) and CLI tool for running, inspecting, and debugging playbooks inside Execution Environments.
- **`ansible-runner`**: Low-level runtime engine that executes Ansible tasks inside containerized or isolated environments.

---

## Defining an EE (`execution-environment.yml` v3)

```yaml
version: 3

images:
  base_image:
    name: registry.fedoraproject.org/fedora:42

dependencies:
  ansible_core:
    package_pip: ansible-core==2.18.2
  ansible_runner:
    package_pip: ansible-runner==2.4.0
  python_interpreter:
    package_system: python3
    python_path: /usr/bin/python3

  # System RPM / DEB packages installed in base container
  system:
    - openssh-clients
    - sshpass
    - git
    - libpq-devel

  # Python pip dependencies
  python:
    - psycopg2-binary
    - botocore
    - boto3
    - requests

  # Ansible collections installed into EE
  galaxy:
    collections:
      - name: community.general
        version: ">=9.0.0"
      - name: community.postgresql
      - name: amazon.aws

additional_build_steps:
  prepend_base:
    - RUN dnf install -y epel-release || true
  append_final:
    - RUN echo "EE build finished successfully"
```

---

## Building Execution Environments (`ansible-builder`)

```bash
# Build using Podman (default runtime)
ansible-builder build --tag my-custom-ee:1.0.0

# Build using Docker
ansible-builder build --container-runtime docker --tag my-custom-ee:1.0.0

# Generate build context (Containerfile) without building the image
ansible-builder create

# Inspect generated Containerfile
cat context/Containerfile
```

---

## Running Playbooks in EEs (`ansible-navigator`)

`ansible-navigator` executes playbooks inside your custom or community Execution Environments:

```bash
# Run playbook using a custom EE
ansible-navigator run site.yml \
  -i inventory.ini \
  --execution-environment-image my-custom-ee:1.0.0 \
  --mode stdout \
  --pull-policy missing

# Run using the official community minimal EE
ansible-navigator run test.yml \
  --execution-environment-image ghcr.io/ansible-community/community-ee-minimal:latest \
  --mode stdout

# Run ad-hoc command inside EE
ansible-navigator exec "ansible localhost -m setup" \
  --execution-environment-image ghcr.io/ansible-community/community-ee-base:latest \
  --mode stdout

# Inspect collections inside an EE
ansible-navigator collections \
  --execution-environment-image ghcr.io/ansible-community/community-ee-base:latest
```

### Community Base Images
- `ghcr.io/ansible-community/community-ee-minimal:latest`: Lightweight image containing only `ansible-core` and runner.
- `ghcr.io/ansible-community/community-ee-base:latest`: Base image containing `ansible-core` plus commonly used community collections.
