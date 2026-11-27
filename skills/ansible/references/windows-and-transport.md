# Ansible Windows Host Management & Transports

## Managed Windows Requirements

Ansible manages Windows targets agentlessly using native Windows APIs:
- **Supported OS**: Windows Server 2016, 2019, 2022, 2025, and Windows 10/11.
- **PowerShell**: Requires PowerShell 5.1 or newer (default on Server 2016+).
- **Control Node**: Must be Linux / macOS / WSL (native Windows cannot act as a control node).
- **Module Language**: Modules for Windows are written in **PowerShell / C#** (POSIX Python modules do not execute on Windows).

---

## Transport Protocols: PSRP vs. WinRM vs. SSH

| Transport | Connection Plugin | Default Port | Recommended For | Notes |
|-----------|-------------------|--------------|-----------------|-------|
| **PSRP** | `ansible_connection: psrp` | 5986 (HTTPS) | **Modern default** | Faster than WinRM, better proxy handling, requires `pypsrp` |
| **WinRM** | `ansible_connection: winrm` | 5986 (HTTPS) / 5985 (HTTP) | Legacy Windows setups | Traditional SOAP over HTTP/HTTPS, requires `pywinrm` |
| **SSH** | `ansible_connection: ssh` | 22 | Server 2022+ / OpenSSH | Uses native OpenSSH, faster file transfers, requires `powershell` shell type |

---

## Windows Connection Variables

### 1. PSRP / WinRM Configuration (Recommended: HTTPS 5986)

```yaml
# Inventory variables for Windows host
ansible_host: 192.168.1.100
ansible_user: Administrator
ansible_password: "{{ vault_win_password }}"

# Transport: PSRP (recommended) or winrm
ansible_connection: psrp
ansible_port: 5986
ansible_psrp_auth: negotiate       # basic | certificate | negotiate | kerberos | ntlm | credssp
ansible_psrp_cert_validation: ignore # Use 'ignore' for self-signed certs or provide ca_cert

# If using WinRM plugin:
# ansible_connection: winrm
# ansible_port: 5986
# ansible_winrm_transport: ntlm   # basic | certificate | kerberos | ntlm | credssp
# ansible_winrm_server_cert_validation: ignore
```

### 2. Windows over OpenSSH (Ansible 2.18+)

```yaml
ansible_host: 192.168.1.100
ansible_connection: ssh
ansible_user: AdminUser
ansible_port: 22
ansible_shell_type: powershell     # Explicitly tell Ansible to execute in PowerShell
ansible_ssh_private_key_file: ~/.ssh/win_id_ed25519
```

> **Admin Key Note**: On Windows OpenSSH, administrative accounts must place public keys in `C:\ProgramData\ssh\administrators_authorized_keys` with restricted ACLs.

---

## WinRM Authentication Methods

- **NTLM / Negotiate**: Default for workgroup or domain environments.
- **Basic Auth**: For local accounts over HTTPS only. Requires `LocalAccountTokenFilterPolicy = 1` in registry.
- **Kerberos**: Preferred for Active Directory domains. Requires domain account formatted as `user@REALM.COM` and `kinit` on control node.
- **CredSSP**: Delegates credentials to resolve the **double-hop issue** (accessing second-hop network shares from Ansible).
- **Certificate Auth**: Passwordless authentication using X.509 client certificates.

---

## Windows Host Setup Script (PowerShell)

Run once on target Windows node to configure WinRM HTTPS:

```powershell
# Run in Administrator PowerShell
Enable-PSRemoting -Force -SkipNetworkProfileCheck

# Allow unencrypted local token access
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -Name 'LocalAccountTokenFilterPolicy' -Value 1 -Type DWord

# Create Self-Signed Certificate and HTTPS Listener
$Cert = New-SelfSignedCertificate -DnsName $env:COMPUTERNAME -CertStoreLocation Cert:\LocalMachine\My
New-Item -Path WSMan:\localhost\Listener -Transport HTTPS -Address * -CertificateThumbPrint $Cert.Thumbprint -Force

# Open Firewall Port 5986
New-NetFirewallRule -Name "WinRM-HTTPS" -DisplayName "WinRM HTTPS" -Enabled True -Profile Any -Action Allow -Direction Inbound -LocalPort 5986 -Protocol TCP
```

---

## Windows Modules Reference

Windows automation uses dedicated collections:
- `ansible.windows`: Core Windows modules (`win_service`, `win_package`, `win_user`, `win_group`, `win_copy`, `win_file`, `win_template`, `win_reboot`, `win_command`, `win_shell`, `win_updates`).
- `community.windows`: Community Windows modules (`win_chocolatey`, `win_iis_website`, `win_firewall_rule`, `win_certutil`).
- `chocolatey.chocolatey`: Package management via Chocolatey.

### Example Windows Playbook Task

```yaml
- name: Manage Windows Services and Updates
  hosts: windows
  tasks:
    - name: Ensure Windows Update service is running
      ansible.windows.win_service:
        name: wuauserv
        state: started
        start_mode: auto

    - name: Install software package using Chocolatey
      chocolatey.chocolatey.win_chocolatey:
        name: git
        state: present

    - name: Reboot Windows host if required
      ansible.windows.win_reboot:
        reboot_timeout: 600
        post_reboot_delay: 15
```
