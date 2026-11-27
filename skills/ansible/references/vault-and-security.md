# Ansible Vault & Secrets Management

## Overview & Principles

Ansible Vault provides symmetric encryption (**AES-256**) for sensitive files, structured YAML dictionaries, and individual string variables.
- **Data at Rest**: Vault encrypts secrets on disk to allow version control in Git.
- **Decryption Lifecycle**: Encrypted files are decrypted in memory on the control node when needed; files transferred via `copy`, `template`, or `unarchive` are transferred **decrypted** to the managed node.
- **Output Masking**: In `ansible-core` 2.22+, decrypted vault variables are automatically masked in output logs. Always pair sensitive tasks with `no_log: true` to prevent secrets leaking in stdout/stderr.

---

## File Encryption vs. Variable Encryption

### 1. Encrypted Files
Entire YAML files (such as `group_vars/production/vault.yml`) or arbitrary binary files can be encrypted in place:
```bash
# File header indicates AES-256 vault payload
$ANSIBLE_VAULT;1.1;AES256
38333234386566623533613662643530663161393661623930353139383637386237666236613337
...
```

### 2. Encrypted Variables (`!vault |`)
Individual scalar strings can be encrypted inline, leaving surrounding configuration readable:
```yaml
db_user: app_user
db_host: postgres.internal
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  34363236316232653564613264663635393437636166343534633732383838383630656637383636
  3032333738313437363439363032343834373464303964340a343564343162396131366130323461
```

---

## `ansible-vault` CLI Reference

### Subcommands

```bash
# 1. Create a new encrypted file
ansible-vault create vars/vault.yml

# 2. Edit an existing encrypted file (decrypts into temp file, launches $EDITOR)
ansible-vault edit vars/vault.yml

# 3. View decrypted content in terminal without opening an editor
ansible-vault view vars/vault.yml

# 4. Encrypt an existing unencrypted file in place
ansible-vault encrypt vars/secrets.yml

# 5. Decrypt an encrypted file in place permanently
ansible-vault decrypt vars/secrets.yml

# 6. Rotate password / rekey files
ansible-vault rekey vars/vault.yml

# 7. Encrypt inline string variable
ansible-vault encrypt_string 'SuperSecretP@ssword' --name 'db_password'

# 8. Encrypt string from stdin (prevents password appearing in shell history)
echo -n 'SuperSecretP@ssword' | ansible-vault encrypt_string --stdin-name 'db_password'
```

---

## Vault IDs & Multiple Passwords

Vault IDs (`--vault-id label@source`) allow different passwords for different environments (e.g., `dev` vs. `prod`):

### Password Sources
- **Interactive Prompt**: `@prompt`
- **Password File**: `/path/to/password_file`
- **Client Script**: `/path/to/password_client.py` (an executable script that outputs the password to stdout)

### Working with Vault IDs

```bash
# Encrypt with a specific vault ID label and password file
ansible-vault encrypt vars/dev_secrets.yml --vault-id dev@~/.vault_dev
ansible-vault encrypt vars/prod_secrets.yml --vault-id prod@~/.vault_prod

# Encrypt inline string with specific vault ID
ansible-vault encrypt_string --vault-id prod@prompt 'secret123' --name 'api_key'

# Rekey to rotate vault password and label
ansible-vault rekey vars/secrets.yml \
  --vault-id old_label@old_passfile \
  --new-vault-id new_label@new_passfile

# Run playbook with multiple vault passwords
ansible-playbook site.yml \
  --vault-id dev@~/.vault_dev \
  --vault-id prod@prompt
```

---

## Vault Password Client Scripts

Instead of storing static plaintext password files, integrate with secret stores (1Password, HashiCorp Vault, AWS Secrets Manager) using executable password client scripts:

- The script must be executable (`chmod +x`).
- The script name must end with `-client` or `-client.<ext>` (e.g. `vault-keyring-client.py`).
- Ansible invokes the script with `--vault-id <label>`.
- The script outputs the password on a single line to `stdout`.

```python
#!/usr/bin/env python3
import sys
import subprocess

# Parse --vault-id <label>
vault_id = None
if "--vault-id" in sys.argv:
    idx = sys.argv.index("--vault-id")
    if idx + 1 < len(sys.argv):
        vault_id = sys.argv[idx + 1]

# Retrieve from local keyring / secret store
if vault_id == "production":
    secret = subprocess.check_output(["pass", "ansible/production"]).decode().strip()
    print(secret)
else:
    secret = subprocess.check_output(["pass", "ansible/dev"]).decode().strip()
    print(secret)
```
