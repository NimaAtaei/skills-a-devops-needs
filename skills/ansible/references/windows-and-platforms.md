# Ansible Windows & Platform Management

## Windows Architecture & Transports

Windows managed nodes do **not** run Python or SSH by default. Ansible communicates with Windows nodes via:
1. **WinRM (`winrm`)**: Windows Remote Management using SOAP over HTTP (port `5985`) or HTTPS (port `5986`).
2. **PSRP (`psrp`)**: PowerShell Remoting Protocol over WinRM (faster, more resilient under load, better proxy handling).
3. **SSH (`ssh`)**: Native OpenSSH on Windows (officially supported in modern Ansible).

```text
┌───────────────────────┐                  ┌─────────────────────────────────┐
│     CONTROL NODE      │                  │          WINDOWS NODE           │
│                       │                  │                                 │
│  ansible-playbook     │ WinRM 5986 / SSH │  - WinRM / PSRP Service         │
│  - pywinrm / pypsrp   ├─────────────────►│  - PowerShell 5.1+ (or 7+)      │
│  - ansible.windows    │                  │  - Remote PS Module Execution   │
│  - community.windows  │                  │  - LocalAccountTokenFilterPolicy│
└───────────────────────┘                  └─────────────────────────────────┘
```

---

## Configuring Windows Inventory

### HTTPS WinRM Configuration (Recommended)

```yaml
# inventory/windows.yaml
windows:
  hosts:
    win01.corp.example.com:
      ansible_host: 192.168.20.10
  vars:
    ansible_connection: winrm
    ansible_port: 5986
    ansible_winrm_server_cert_validation: validate
    ansible_winrm_transport: ntlm # Choices: basic, ntlm, kerberos, credssp, certificate
    ansible_user: Administrator@CORP.EXAMPLE.COM
    ansible_password: "{{ vault_win_password }}"
```

### SSH Transport Configuration (Alternative)

```yaml
windows:
  hosts:
    win01.corp.example.com:
      ansible_host: 192.168.20.10
  vars:
    ansible_connection: ssh
    ansible_shell_type: powershell
    ansible_user: Administrator
    ansible_ssh_private_key_file: ~/.ssh/id_rsa
```

---

## WinRM Authentication Matrix

| Method | Protocol | Transport Requirement | Use Case |
|--------|----------|-----------------------|----------|
| **Kerberos** | Active Directory | Domain-joined hosts, HTTPS or HTTP | Enterprise domain environments |
| **NTLM** | Workgroup / Domain | HTTPS recommended | Standalone or domain hosts without Kerberos |
| **CredSSP** | Workgroup / Domain | HTTPS required | Resolves the "double-hop" delegation problem |
| **Certificate** | Client Cert | HTTPS required | Passwordless PKI authentication |
| **Basic** | Local user | HTTPS strictly required | Testing / isolated workgroups |

---

## Windows Gotchas & Solutions

### 1. The "Double-Hop" Authentication Problem
When connecting over WinRM with NTLM or Kerberos (without unconstrained delegation), Windows uses a **Network Logon**. Network logons cannot delegate credentials to a second remote machine (e.g., accessing an SMB share or domain controller).

**Solutions**:
- Use `become: true` with explicit credentials (creates an interactive logon):
  ```yaml
  - name: Copy artifact from network share
    ansible.windows.win_copy:
      src: \\fileserver\share\setup.exe
      dest: C:\temp\setup.exe
      remote_src: true
    become: true
    become_method: runas
    become_user: CORP\svc_installer
    vars:
      ansible_become_password: "{{ vault_svc_password }}"
  ```
- Use `ansible_winrm_transport: credssp`.

### 2. Local Administrator UAC Restrictions
Local admin accounts connecting over WinRM are stripped of elevated tokens unless `LocalAccountTokenFilterPolicy` is set:
```powershell
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "LocalAccountTokenFilterPolicy" -Value 1 -Type DWord
```

---

## Essential Windows Modules (`ansible.windows` & `community.windows`)

- **Package Management**: `ansible.windows.win_package` (MSI/EXE), `chocolatey.chocolatey.win_chocolatey`.
- **Services & Processes**: `ansible.windows.win_service`, `community.windows.win_scheduled_task`.
- **Files & Registry**: `ansible.windows.win_copy`, `ansible.windows.win_file`, `ansible.windows.win_template`, `ansible.windows.win_regedit`.
- **PowerShell Execution**: `ansible.windows.win_powershell`, `ansible.windows.win_command`.
- **System & Reboots**: `ansible.windows.win_reboot` (handles post-reboot reconnect automatically).
