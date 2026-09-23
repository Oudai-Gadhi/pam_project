<div align="center">

<!-- ═══════════════════════════════════════════════════════════ -->
<!--                          HEADER                              -->
<!-- ═══════════════════════════════════════════════════════════ -->

<img src="https://img.shields.io/badge/status-lab--ready-brightgreen?style=for-the-badge" alt="status">
<img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="license">
<img src="https://img.shields.io/badge/version-1.0.0-purple?style=for-the-badge" alt="version">

<br><br>

# 🔐 JIT-PAM

### *Just-in-Time Privileged Access Management*

**Ephemeral SSH certificates. Zero standing access. Full audit trail.**

<br>

A reference implementation of just-in-time privileged access — replacing long-lived SSH keys and shared passwords with **short-lived certificates that exist only for the duration of an approved session**.

<br>

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Keycloak](https://img.shields.io/badge/Keycloak-26-4D4D4D?style=flat-square&logo=keycloak&logoColor=white)](https://keycloak.org)
[![Vault](https://img.shields.io/badge/Vault-1.17-FFEC6E?style=flat-square&logo=vault&logoColor=black)](https://vaultproject.io)
[![Guacamole](https://img.shields.io/badge/Guacamole-1.6-1D8DCC?style=flat-square&logo=apache&logoColor=white)](https://guacamole.apache.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docs.docker.com/compose)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)

<br>

[**Overview**](#-overview) · [**Architecture**](#-architecture) · [**How It Works**](#-how-it-works) · [**Quick Start**](#-quick-start) · [**Security**](#-security-model) · [**Operations**](#-operations) · [**Roadmap**](#-roadmap)

<br>

---

</div>

<br>

## 📖 Overview

**JIT-PAM** answers a simple question that has haunted infrastructure teams for decades:

> *"Why does an engineer who needs five minutes of access to fix a production issue keep a permanent key that works forever?"*

It shouldn't. And in JIT-PAM, it doesn't.

<br>

### The Old Way vs. The JIT Way

<table>
<tr>
<th width="50%">❌ Traditional SSH Access</th>
<th width="50%">✅ JIT-PAM</th>
</tr>
<tr>
<td>

- Static keys in `~/.ssh/authorized_keys`
- Never rotated, never revoked
- Shared `root` passwords
- No attribution, no accountability
- Always-on attack surface
- Manual approval over chat/email
- No enforceable SLA

</td>
<td>

- **Ephemeral** certificates, born on demand
- **Expire automatically** with the approval window
- **Per-user private keys**, unique per session
- **Full audit trail** in PostgreSQL
- **Zero standing access**
- **Explicit approval** by a second party
- **Enforced time bounds** at three layers

</td>
</tr>
</table>

<br>

### The Guarantee

```text
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   The private key never touches disk.                        ║
║                                                              ║
║   It is generated in RAM, used once, and destroyed.          ║
║                                                              ║
║   There is nothing to steal from the database.               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

<br>

### What Makes This Different

<table>
  <thead>
    <tr>
      <th width="30%">Feature</th>
      <th width="70%">Why it matters</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>One-shot issuance</strong></td>
      <td>The Connect endpoint locks the request row with <code>SELECT … FOR UPDATE</code>. A request can produce exactly one certificate — replay is impossible at the database level.</td>
    </tr>
    <tr>
      <td><strong>Four independent trust boundaries</strong></td>
      <td>Keycloak, the Broker, Vault, and the target's <code>sshd</code> each enforce their own rule. Compromising one doesn't collapse the others.</td>
    </tr>
    <tr>
      <td><strong>Cross-distro onboarding in one command</strong></td>
      <td><code>subscribe-vm.sh</code> configures Ubuntu 20.04+ and RHEL/Rocky/Alma 8–9 targets the same way: installs the CA, writes principals files, handles SELinux, reloads sshd, registers the target.</td>
    </tr>
    <tr>
      <td><strong>RSA-3072 user keys</strong></td>
      <td>Generated in-memory because Guacamole's libssh2 rejects Ed25519 certificates. Vault's CA stays Ed25519 — only the user key type is constrained.</td>
    </tr>
    <tr>
      <td><strong>Encrypted handoff to Guacamole</strong></td>
      <td>The private key travels inside an HMAC-SHA256-signed, AES-128-CBC-encrypted envelope shared only by the Broker and Guacamole. No file ever lands on disk.</td>
    </tr>
  </tbody>
</table>

---

## 🏛 Architecture

### High-Level Topology

```mermaid
flowchart LR
    subgraph WS["🖥️  Operator Workstation"]
        B["Browser<br/>(React SPA)"]
    end
    subgraph HOST["🏢  PAM Host (Linux VM)"]
        KC["🔑 Keycloak<br/>:8080"]
        VA["🔒 Vault<br/>:8210"]
        GU["🖥️ Guacamole<br/>:8081"]
        BE["⚡ PAM Broker<br/>(FastAPI)"]
        DB[("🗄️ PostgreSQL<br/>pam-db")]
    end
    subgraph TGT["🎯  Target Server"]
        SSHD["sshd<br/>trusts Vault CA"]
    end

    B -- "HTTPS :3000" --> BE
    B -- "OAuth" --> KC
    B -- "data=..." --> GU
    BE -- "JWKS" --> KC
    BE -- "sign" --> VA
    BE -- "SQL" --> DB
    GU -- "auth-json" --> BE
    GU -- "SSH :22" --> SSHD

    style B fill:#61DAFB,color:#000
    style KC fill:#4D4D4D,color:#fff
    style VA fill:#FFEC6E,color:#000
    style GU fill:#1D8DCC,color:#fff
    style BE fill:#009688,color:#fff
    style DB fill:#4169E1,color:#fff
    style SSHD fill:#E95420,color:#fff
```

### The Four Trust Boundaries

Each layer answers one question. None of them trusts the others to do its job.

<table>
  <thead>
    <tr>
      <th align="center">#</th>
      <th>Layer</th>
      <th>Component</th>
      <th>Question It Answers</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center">1️⃣</td>
      <td><strong>Identity</strong></td>
      <td>Keycloak</td>
      <td><em>Who is this human?</em></td>
    </tr>
    <tr>
      <td align="center">2️⃣</td>
      <td><strong>Authorization</strong></td>
      <td>FastAPI Broker</td>
      <td><em>Are they allowed to request this?</em></td>
    </tr>
    <tr>
      <td align="center">3️⃣</td>
      <td><strong>Credential</strong></td>
      <td>HashiCorp Vault</td>
      <td><em>Am I permitted to sign this principal?</em></td>
    </tr>
    <tr>
      <td align="center">4️⃣</td>
      <td><strong>Acceptance</strong></td>
      <td>Target <code>sshd</code></td>
      <td><em>Is this principal valid for this Linux account?</em></td>
    </tr>
  </tbody>
</table>

> 💡 **Defense in depth:** Compromising one layer does not collapse the others. An attacker who tricks the broker still faces Vault. An attacker who tricks Vault still faces `sshd`.

---

## ⚙ How It Works

### The Credential Lifecycle

```text
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ REQUEST  │ ──▶ │ APPROVE  │ ──▶ │ CONNECT  │ ──▶ │ SESSION  │ ──▶ │  EXPIRY  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │                │
     ▼                ▼                ▼                ▼                ▼
 pam_user         approver        pam_user          guacd +        automatic
 submits          decides         clicks            target         on cert
 request          w/ comment      "Connect"         sshd           TTL
```

### The Connect Sequence

This is where the ephemeral credential is born. Twelve hops. Two cryptographic layers. One private key that never touches disk.

```mermaid
sequenceDiagram
    autonumber
    participant B as 🖥️ Browser
    participant N as 🌐 nginx
    participant P as ⚡ Broker
    participant K as 🔑 Keycloak
    participant V as 🔒 Vault
    participant G as 🖥️ Guacamole
    participant T as 🎯 Target

    B->>N: POST /api/requests/{id}/connect
    N->>P: proxy (X-Forwarded-For)
    P->>K: fetch JWKS (cached)
    K-->>P: signing keys
    P->>P: verify JWT + groups
    P->>P: SELECT ... FOR UPDATE
    P->>P: generate RSA-3072 (RAM only)
    P->>V: POST /sign/dev-role<br/>{public_key, principals, ttl}
    V->>V: check token + role + TTL
    V-->>P: signed certificate + serial
    P->>P: store serial only (not key!)
    P->>P: build auth-json envelope<br/>(HMAC + AES w/ shared secret)
    P-->>N: { redirect_url }
    N-->>B: 200 OK
    B->>G: GET /guacamole?data=...
    G->>G: decrypt envelope
    G->>T: SSH handshake, offer cert
    T->>T: verify cert against CA
    T-->>G: challenge
    G->>T: signed challenge (private key)
    T-->>G: ✅ authenticated
    G-->>B: WebSocket terminal
```

### Two Cryptographic Layers

It is tempting to think of this as one system. It is two, and they never overlap.

<table>
  <thead>
    <tr>
      <th>Layer</th>
      <th>Purpose</th>
      <th>Key Type</th>
      <th>Who Uses It</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Guacamole Envelope</strong></td>
      <td>Protect the handoff from Broker to Guacamole</td>
      <td>Symmetric<br><code>HMAC-SHA256</code> + <code>AES-128-CBC</code></td>
      <td>Broker encrypts · Guacamole decrypts</td>
    </tr>
    <tr>
      <td><strong>SSH Certificate</strong></td>
      <td>Prove the client is authorized to log in</td>
      <td>Asymmetric<br>Vault CA</td>
      <td>Vault signs · <code>sshd</code> verifies</td>
    </tr>
  </tbody>
</table>

> ⚠️ **Layer 1** ends at Guacamole. Once Guacamole opens the envelope, that secret is done.  
> **Layer 2** starts at `guacd`. The certificate is used in the SSH handshake with the target.  
> The target never sees the Guacamole secret.  
> Guacamole never sees the Vault CA private key.

### Why the Private Key Never Touches Disk

<table>
  <thead>
    <tr>
      <th>Stage</th>
      <th>Where the Private Key Lives</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Generated</td>
      <td>Broker Python process RAM</td>
    </tr>
    <tr>
      <td>Sent to Vault?</td>
      <td>❌ <strong>No</strong> — only the public key is sent</td>
    </tr>
    <tr>
      <td>Stored in DB?</td>
      <td>❌ <strong>No</strong> — only the certificate serial</td>
    </tr>
    <tr>
      <td>Handed to Guacamole</td>
      <td>Inside an HMAC-signed + AES-encrypted envelope</td>
    </tr>
    <tr>
      <td>Used by guacd</td>
      <td><code>guacd</code> process RAM</td>
    </tr>
    <tr>
      <td>After session</td>
      <td>Garbage collected</td>
    </tr>
  </tbody>
</table>

> 🔒 If `pam-db` is exfiltrated, no credentials leak. The database contains only metadata: who requested, what they requested, when, and the certificate serial number.

### Why `source-address` Can't Be the User's IP

When Guacamole is in the path, the TCP client that reaches the target is **`guacd`**, not the developer's browser. If the Vault role sets a `source-address` critical option to the browser IP, the target will reject the session — the source IP is `guacd`'s, not the browser's.

The broker records the browser IP in the audit trail instead. If you later want `source-address` enforcement, use the `guacd` egress CIDR.

---

## 🚀 Quick Start

### Prerequisites

<table>
  <tr>
    <th>Requirement</th>
    <th>Minimum Version</th>
  </tr>
  <tr>
    <td>Docker</td>
    <td>24+</td>
  </tr>
  <tr>
    <td>Docker Compose</td>
    <td>v2</td>
  </tr>
  <tr>
    <td>Linux VM (Ubuntu 22.04+ or RHEL 9)</td>
    <td>with sudo</td>
  </tr>
  <tr>
    <td>Target server with <code>sshd</code></td>
    <td>Ubuntu 20.04+ or RHEL 8/9</td>
  </tr>
  <tr>
    <td><code>jq</code> on the VM</td>
    <td>used by the onboarding script</td>
  </tr>
</table>

### Deployment Flow

```text
  ┌─────────────────────────────────────────────────────────────┐
  │  1. Configure .env   (PUBLIC_HOST, VAULT_TOKEN, Guac secret)│
  │  2. Bring up Vault   (unseal) + Guacamole + Keycloak        │
  │  3. Configure Keycloak (realm, groups, client)              │
  │  4. Onboard a target (subscribe-vm.sh)                      │
  │  5. docker compose up -d                                    │
  │  6. Sign in → request → approve → connect                   │
  └─────────────────────────────────────────────────────────────┘
```

<details open>
<summary><b>Step 1 · Clone &amp; Configure</b></summary>

```bash
git clone https://github.com/<your-org>/pam_project.git
cd pam_project
cp .env.example .env
${EDITOR:-vi} .env
```

Set at minimum:

| Variable | Value |
|---|---|
| `PUBLIC_HOST` | Your VM's LAN IP (e.g. `192.168.1.36`) |
| `VAULT_TOKEN` | Root token from `guac-vault-stack/vault-init.txt` |
| `GUACAMOLE_JSON_SECRET` | 32 hex chars — **must match** `GUAC_JSON_SECRET` in `guac-vault-stack/.env` |
| `PAM_DB_PASSWORD` | A real password, not the placeholder |

Generate the Guacamole secret if you don't have one:

```bash
openssl rand -hex 16
```
</details>

<details>
<summary><b>Step 2 · Bring Up Vault, Guacamole &amp; Keycloak</b></summary>

**Vault + Guacamole** (`guac-vault-stack/`):

```bash
cd guac-vault-stack
docker compose up -d

# Vault re-seals on every restart
./unseal.sh

# Verify
docker exec -e VAULT_ADDR=http://127.0.0.1:8210 vault vault status | grep Sealed
# Sealed  false
```

**Keycloak** (`keycloak/`):

```bash
cd ../keycloak
docker compose up -d

# Verify the issuer matches what the browser sees
curl -s http://<VM-IP>:8080/realms/pam/.well-known/openid-configuration \
  | grep '"issuer"'
# "issuer": "http://192.168.1.36:8080/realms/pam"
```

> 💾 Back up `guac-vault-stack/vault-init.txt` immediately. Without the unseal key, Vault is unrecoverable.
</details>

<details>
<summary><b>Step 3 · Configure Keycloak</b></summary>

Follow `KEYCLOAK-SETUP.md`. At minimum:

- ✅ Create realm `pam`
- ✅ Create groups `pam_users` and `approvers`
- ✅ Create public client `pam-app` with redirect `http://<VM-IP>:3000/*`
- ✅ Add a Group Membership mapper that emits `groups` on access tokens

Without the mapper, every authenticated user lands on `/unauthorized`.
</details>

<details>
<summary><b>Step 4 · Onboard a Target Server</b></summary>

From `pam_project/`:

```bash
./scripts/subscribe-vm.sh <TARGET-IP> <ADMIN-USER> <CERT-USERS> [SSH-PORT]
```

Examples:

```bash
./scripts/subscribe-vm.sh 192.168.1.173 ubuntu oudai
./scripts/subscribe-vm.sh 192.168.1.174 ec2-user oudai,deploy
```

The script:

1. Copies the Vault CA public key to the target
2. Installs it at `/etc/ssh/trusted-user-ca-keys.pem` (SELinux-labeled on RHEL)
3. Writes `/etc/ssh/sshd_config.d/90-vault-ca.conf`
4. Creates `/etc/ssh/auth_principals/<user>` for each cert user
5. Validates with `sshd -t`, then reloads `sshd`
6. Merges the target into `PAM_TARGETS_JSON` in `.env`
7. Recreates the backend

You'll be prompted for the target's SSH password and sudo password once. The script runs `ssh -t` so `sudo` can prompt.

**Prove cert login before touching the browser:**

```bash
ssh-keygen -q -t ed25519 -N "" -f /tmp/test-key -C test-cert

ROOT_TOKEN=$(grep 'Initial Root Token' ../guac-vault-stack/vault-init.txt | awk '{print $NF}')
docker exec -i -e VAULT_ADDR=http://127.0.0.1:8210 -e VAULT_TOKEN="$ROOT_TOKEN" \
  vault vault write -format=json ssh-client-signer/sign/dev-role - <<EOF \
  | jq -r .data.signed_key > /tmp/test-key-cert.pub
{"public_key":"$(cat /tmp/test-key.pub)","valid_principals":"oudai","ttl":"5m"}
EOF

ssh -o IdentitiesOnly=yes -i /tmp/test-key \
    -o CertificateFile=/tmp/test-key-cert.pub \
    oudai@<TARGET-IP>
```

A shell prompt means the whole target-side chain works: Vault signed, sshd trusted, principal accepted.
</details>

<details>
<summary><b>Step 5 · Start the PAM Application</b></summary>

```bash
cd pam_project
docker compose up --build -d
docker compose ps
```

Wait for `pam-backend` to report `healthy` — `pam-frontend` depends on it.
</details>

<details>
<summary><b>Step 6 · Use It</b></summary>

Open `http://<VM-IP>:3000` in a browser. Sign in with Keycloak.

| Role | Action |
| :--- | :--- |
| `pam_users` | Submit access requests, click Connect on approved ones |
| `approvers` | Review pending requests, approve or reject with a comment |

End-to-end:

1. Sign in as `pam_users` → submit a request (target IP, Linux user, justification, duration)
2. Sign in as a **different** `approvers` user → approve or reject with a comment
3. Return to the requester → click **Connect**
4. Guacamole opens a terminal on the target
</details>

---

## 🛡 Security Model

### Threat Coverage

<table>
  <thead>
    <tr>
      <th>Threat</th>
      <th>Mitigation</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Credential theft from database</td>
      <td>🔒 Private keys never stored; only serial numbers</td>
    </tr>
    <tr>
      <td>Credential replay</td>
      <td>🔒 One-shot issuance; <code>connect_issued_at</code> set inside <code>FOR UPDATE</code> transaction</td>
    </tr>
    <tr>
      <td>Standing access</td>
      <td>⏱️ Certificates expire with the approval window</td>
    </tr>
    <tr>
      <td>Self-approval</td>
      <td>🚫 Approvers cannot decide their own requests</td>
    </tr>
    <tr>
      <td>Arbitrary target access</td>
      <td>📋 <code>PAM_TARGETS_JSON</code> allow-list; unregistered IPs rejected</td>
    </tr>
    <tr>
      <td>Cross-account access</td>
      <td>🎯 Certificate principal must match <code>AuthorizedPrincipalsFile</code></td>
    </tr>
    <tr>
      <td>Credential lifetime abuse</td>
      <td>⏱️ Vault role <code>max_ttl</code> + target's certificate window</td>
    </tr>
    <tr>
      <td>Unauthenticated API access</td>
      <td>🔐 Every endpoint verifies JWT against Keycloak JWKS</td>
    </tr>
  </tbody>
</table>

### Layers of Defense

```text
   ┌─────────────────────────────────────────────────────────┐
   │  1. Keycloak       →  proves the human's identity       │
   │  2. FastAPI        →  re-verifies JWT + re-checks group │
   │  3. Broker         →  locks the row, enforces state     │
   │  4. Vault          →  restricts signing to principals   │
   │  5. Target sshd    →  restricts principals per user     │
   └─────────────────────────────────────────────────────────┘
```

### 🔑 The Single Most Important Principle

<div align="center">

```text
╔═════════════════════════════════════════════════════════════╗
║                                                             ║
║   A PRIVATE KEY MUST NEVER PERSIST.                         ║
║                                                             ║
║   Anywhere. Ever.                                           ║
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
```

</div>

Every architectural decision flows from this: the database stores serial numbers, not keys; Vault signs public keys, it doesn't hold private keys; Guacamole receives keys in encrypted envelopes, not files. If a component is compromised, there is nothing to steal that remains useful.

### ⚠️ Lab Notes

This is a **lab reference implementation**. The following are acceptable here but **must be changed before production**:

| Item | Lab | Production |
|---|---|---|
| Transport | Plain HTTP | HTTPS everywhere (nginx, Keycloak, Vault) |
| Vault auth | Root token | AppRole with a scoped policy |
| Vault unseal | Shamir, manual | Auto-unseal via KMS or transit Vault |
| Database migrations | Startup `ALTER TABLE` | Alembic |
| Rate limiting | None | Per-IP and per-identity limits |
| Host key verification | Disabled (guacd → target) | Pinned fingerprints |
| Session recording | None | `guacenc` for replay |
| Reverse proxy | nginx plain | TLS-terminating proxy |

---

## 🔧 Operations

### Day-2 Tasks

<table>
  <thead>
    <tr>
      <th>Task</th>
      <th>Command</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Unseal Vault after restart</td>
      <td><code>cd guac-vault-stack &amp;&amp; ./unseal.sh</code></td>
    </tr>
    <tr>
      <td>Add a new target</td>
      <td><code>./scripts/subscribe-vm.sh &lt;IP&gt; &lt;ADMIN&gt; &lt;USER[,USER2]&gt;</code></td>
    </tr>
    <tr>
      <td>Check Vault status</td>
      <td><code>docker exec -e VAULT_ADDR=http://127.0.0.1:8210 vault vault status</code></td>
    </tr>
    <tr>
      <td>View backend logs</td>
      <td><code>docker compose logs -f backend</code></td>
    </tr>
    <tr>
      <td>List recent requests</td>
      <td><code>docker compose exec pam-db psql -U pam -d pam -c "SELECT id, status, requester_username, target_system FROM access_requests ORDER BY created_at DESC LIMIT 10;"</code></td>
    </tr>
  </tbody>
</table>

<details>
<summary><b>🔐 Unsealing Vault</b></summary>

Vault starts sealed after every restart. This is a security feature — someone who steals the disk cannot read the secrets without the unseal key.

```bash
cd guac-vault-stack
./unseal.sh
```

Or manually (note the port — Vault listens on `8210`, not `8200`):

```bash
UNSEAL_KEY=$(grep 'Unseal Key 1' vault-init.txt | awk '{print $NF}')
docker exec -e VAULT_ADDR=http://127.0.0.1:8210 vault \
  vault operator unseal "$UNSEAL_KEY"
```
</details>

<details>
<summary><b>➕ Adding a New Target</b></summary>

```bash
./scripts/subscribe-vm.sh <IP> <ADMIN-USER> <LINUX-USER>[,<LINUX-USER2>,...]
```

The script is idempotent — safe to re-run to add users or refresh the CA:

1. Copies the Vault CA public key to the target
2. Installs it at `/etc/ssh/trusted-user-ca-keys.pem` (SELinux-labeled on RHEL)
3. Writes `/etc/ssh/sshd_config.d/90-vault-ca.conf`
4. Creates `/etc/ssh/auth_principals/<user>` for each cert user
5. Reloads `sshd` after `sshd -t` passes
6. Merges the target into `PAM_TARGETS_JSON` in `.env`
7. Recreates the backend

*Prerequisite: `pamvm` must be able to SSH to the target's admin user. A password prompt is fine — the script passes `-t` to allocate a TTY.*
</details>

<details>
<summary><b>👤 Adding a New Principal (Linux User)</b></summary>

Two places must agree:

**1. Vault role's `allowed_users`**

```bash
ROOT_TOKEN=$(grep 'Initial Root Token' guac-vault-stack/vault-init.txt | awk '{print $NF}')
docker exec -i -e VAULT_ADDR=http://127.0.0.1:8210 -e VAULT_TOKEN="$ROOT_TOKEN" vault \
  vault write ssh-client-signer/roles/dev-role - <<'EOF'
{
  "key_type": "ca",
  "allow_user_certificates": true,
  "allowed_users": "oudai,ubuntu,deploy,backup",
  "ttl": "30m",
  "max_ttl": "1h",
  "default_extensions": {"permit-pty": ""}
}
EOF
```

**2. Target's `/etc/ssh/auth_principals/<user>`** — handled automatically by `subscribe-vm.sh`. Just re-run it with the updated user list.
</details>

<details>
<summary><b>🔄 Rotating the CA</b></summary>

Rotating the CA invalidates every installed `trusted-user-ca-keys.pem`. All targets must be updated.

```bash
ROOT_TOKEN=$(grep 'Initial Root Token' guac-vault-stack/vault-init.txt | awk '{print $NF}')

# Regenerate
docker exec -e VAULT_ADDR=http://127.0.0.1:8210 -e VAULT_TOKEN="$ROOT_TOKEN" vault \
  vault write -f ssh-client-signer/config/ca rotate

# Re-export
docker exec -e VAULT_ADDR=http://127.0.0.1:8210 -e VAULT_TOKEN="$ROOT_TOKEN" vault \
  vault read -field=public_key ssh-client-signer/config/ca > guac-vault-stack/vault_ca.pub

# Re-run subscribe-vm.sh for every target so they install the new CA
./scripts/subscribe-vm.sh <IP> <ADMIN> <USERS>
```
</details>

### 💾 Backups

Two things must be backed up. Everything else is reproducible.

<table>
  <thead>
    <tr>
      <th>Artifact</th>
      <th>Location</th>
      <th>Why</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>vault-init.txt</code></td>
      <td><code>guac-vault-stack/</code></td>
      <td>Contains unseal key and root token</td>
    </tr>
    <tr>
      <td><code>vault_data</code> volume</td>
      <td><code>/var/lib/docker/volumes/...</code></td>
      <td>Contains the CA and roles</td>
    </tr>
  </tbody>
</table>

```bash
# Back up vault-init.txt
cp guac-vault-stack/vault-init.txt ~/vault-init.backup

# Back up the volume
docker run --rm \
  -v guac-vault-stack_vault_data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/vault_data_backup.tar.gz -C /data .
```

### 🧹 Disk Hygiene

> ⚠️ On small VMs, Docker's log growth is the #1 cause of disk exhaustion.

```bash
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
```

Also cap the system journal:

```bash
sudo journalctl --vacuum-size=200M
```

---

## 🧱 Tech Stack

<table>
  <thead>
    <tr>
      <th>Layer</th>
      <th>Technology</th>
      <th>Purpose</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Identity</td>
      <td><strong>Keycloak 26</strong></td>
      <td>OIDC provider, group claims</td>
    </tr>
    <tr>
      <td>Web App</td>
      <td><strong>React 18 + Vite</strong></td>
      <td>SPA for requesters and approvers</td>
    </tr>
    <tr>
      <td>Web Server</td>
      <td><strong>nginx</strong></td>
      <td>Static assets + reverse proxy for <code>/api/*</code></td>
    </tr>
    <tr>
      <td>API</td>
      <td><strong>FastAPI + SQLAlchemy 2</strong></td>
      <td>Request workflow and JIT broker</td>
    </tr>
    <tr>
      <td>Database</td>
      <td><strong>PostgreSQL 16</strong></td>
      <td>Requests, decisions, audit events</td>
    </tr>
    <tr>
      <td>Secrets</td>
      <td><strong>HashiCorp Vault 1.17</strong></td>
      <td>SSH certificate signing</td>
    </tr>
    <tr>
      <td>Gateway</td>
      <td><strong>Apache Guacamole + guacd</strong></td>
      <td>SSH client with auth-json handoff</td>
    </tr>
    <tr>
      <td>Orchestration</td>
      <td><strong>Docker Compose</strong></td>
      <td>Local and VM deployment</td>
    </tr>
  </tbody>
</table>

---

## 📁 Project Structure

```text
pam-platform/
│
├── guac-vault-stack/                   Vault + Guacamole stack
│   ├── docker-compose.yaml
│   ├── guac/init/01-initdb.sql         Guacamole DB schema
│   ├── debug/test-vault-signing.sh     Manual Vault-sign debug tool
│   ├── unseal.sh                       Unseal Vault after restart
│   ├── vault_ca.pub                    Exported CA (used by subscribe-vm.sh)
│   └── vault-init.txt                  🔒 unseal key + root token (gitignored)
│
├── keycloak/                           Identity provider
│   ├── docker-compose.yaml
│   └── .env                            🔒 DB + admin secrets (gitignored)
│
└── pam_project/                        The PAM application
    │
    ├── 🐍 backend/                     FastAPI broker
    │   ├── app/
    │   │   ├── auth/                   JWT validation, group dependencies
    │   │   ├── routes/                 HTTP endpoints
    │   │   ├── services/               Vault + Guacamole integrations
    │   │   ├── config.py               Pydantic settings
    │   │   ├── database.py             SQLAlchemy engine/session
    │   │   ├── models.py               AccessRequest, AuditEvent
    │   │   ├── schemas.py              Pydantic DTOs
    │   │   └── main.py                 FastAPI app entrypoint
    │   └── Dockerfile
    │
    ├── ⚛️  frontend/                    React SPA
    │   ├── src/
    │   │   ├── api/                    Axios client w/ Keycloak interceptor
    │   │   ├── components/             Header, ProtectedRoute, RequestStatus
    │   │   ├── context/                KeycloakContext
    │   │   ├── pages/                  Login, Dashboards, RolePicker
    │   │   └── keycloak.js             Keycloak JS adapter
    │   ├── public/config.js            Runtime config injected by nginx
    │   └── Dockerfile                  Multi-stage build
    │
    ├── 🛠️  scripts/
    │   ├── subscribe-vm.sh             Onboard a target (run on pamvm)
    │   └── target-setup.sh             Called by subscribe-vm.sh on the target
    │
    ├── 🐳 docker-compose.yml           Broker + DB + Frontend
    ├── 📘 KEYCLOAK-SETUP.md            Realm/client configuration guide
    ├── 📘 DEPLOY-VM.md                 VM deployment walkthrough
    └── 📖 README.md                    You are here
```

---

## 🗺 Roadmap

<table>
  <thead>
    <tr>
      <th>Priority</th>
      <th>Item</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>🔴 High</td>
      <td>Pytest suite — request lifecycle, one-shot connect, self-approval</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔴 High</td>
      <td>GitHub Actions — <code>ruff</code> + <code>eslint</code> + tests on every push</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔴 High</td>
      <td>Alembic migrations replacing startup <code>ALTER TABLE</code> statements</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🟡 Medium</td>
      <td>Guacamole session-start/end callbacks → precise <code>ACTIVE</code> semantics</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🟡 Medium</td>
      <td>Session recording via <code>guacenc</code></td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🟡 Medium</td>
      <td>Host key verification (guacd → target)</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🟡 Medium</td>
      <td>Admin UI for audit trail and target registry</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🟢 Low</td>
      <td>Multi-target requests (one approval, N servers)</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔵 Prod</td>
      <td>TLS everywhere (nginx, Keycloak, Vault)</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔵 Prod</td>
      <td>Vault AppRole auth with scoped policy</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔵 Prod</td>
      <td>Auto-unseal via KMS or transit Vault</td>
      <td>📋 Planned</td>
    </tr>
    <tr>
      <td>🔵 Prod</td>
      <td>Rate limiting + IP allow-listing on the broker</td>
      <td>📋 Planned</td>
    </tr>
  </tbody>
</table>

---

## 🤝 Contributing

Contributions welcome. Please open an issue to discuss substantial changes before submitting a PR.

<details>
<summary><b>Development Setup</b></summary>

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
npm run dev
```
</details>

### Conventions

<table>
  <thead>
    <tr>
      <th>Area</th>
      <th>Rule</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Backend</strong></td>
      <td><code>ruff</code> for linting · type hints everywhere · no <code>print</code></td>
    </tr>
    <tr>
      <td><strong>Frontend</strong></td>
      <td>Function components · Tailwind for styling · no class components</td>
    </tr>
    <tr>
      <td><strong>Commits</strong></td>
      <td>Conventional commits — <code>feat:</code>, <code>fix:</code>, <code>docs:</code>, <code>chore:</code></td>
    </tr>
    <tr>
      <td><strong>Secrets</strong></td>
      <td>Never commit <code>.env</code>, <code>vault-init.txt</code>, or <code>.pem</code> files</td>
    </tr>
  </tbody>
</table>

---

## 📜 License

Released under the MIT License. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

Built on the shoulders of giants:

<table>
  <tr>
    <td align="center" width="25%">
      <img src="https://avatars.githubusercontent.com/u/761456?s=100" width="60"><br>
      <b>HashiCorp Vault</b><br>
      <sub>SSH certificate authority</sub>
    </td>
    <td align="center" width="25%">
      <img src="https://avatars.githubusercontent.com/u/47359?s=100" width="60"><br>
      <b>Apache Guacamole</b><br>
      <sub>Clientless SSH gateway</sub>
    </td>
    <td align="center" width="25%">
      <img src="https://avatars.githubusercontent.com/u/4921466?s=100" width="60"><br>
      <b>Keycloak</b><br>
      <sub>Identity &amp; access management</sub>
    </td>
    <td align="center" width="25%">
      <img src="https://avatars.githubusercontent.com/u/156354296?s=100" width="60"><br>
      <b>FastAPI</b><br>
      <sub>Modern Python web framework</sub>
    </td>
  </tr>
</table>

<br>

<div align="center">

⭐ If this project helped you, star it on GitHub.

**JIT-PAM**  
*Credentials that exist for seconds, not years.*

<sub>Built with 🛡️ by engineers who believe access should be earned, not assumed.</sub>

<br><br>

</div>
