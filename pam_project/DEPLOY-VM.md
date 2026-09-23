# Deploy on a Linux VM (browse from Windows)

Your VM has no browser. You develop and access from **Windows**; the VM runs Keycloak, Vault, Guacamole, and this PAM app.

```text
Windows PC (browser)
│
├── http://<VM-IP>:3000 → Frontend (nginx, proxies /api → backend)
├── http://<VM-IP>:8080 → Keycloak
└── http://<VM-IP>:8081 → Guacamole
```

The browser only needs ports **3000**, **8080**, and **8081**. Port 8000 is internal to Docker Compose — nginx forwards `/api/*` to the backend over the Compose network. Windows never talks to 8000 directly.

---

## Prerequisites

| Component | Notes |
| :--- | :--- |
| **Linux VM** (Ubuntu 22.04+ or RHEL 9) | with `sudo` privileges |
| **Docker Engine 24+ and Compose v2** | installed and running |
| **`git`**, **`jq`**, **`ssh`**, **`scp`** | `subscribe-vm.sh` requires `jq` |
| **Target server** with `sshd` | Ubuntu 20.04+ or RHEL 8/9 |
| **Ability to SSH to target as a sudoer** | password prompt is fine |

---

## 1. On the VM — Clone and Configure

```bash
git clone https://github.com/<your-org>/pam_project.git
cd pam_project
cp .env.example .env
${EDITOR:-vi} .env
```

Set at minimum:

| Variable | Value |
| :--- | :--- |
| `PUBLIC_HOST` | Your VM's LAN IP (e.g., `192.168.1.36`) |
| `VAULT_TOKEN` | Root token from `guac-vault-stack/vault-init.txt` |
| `GUACAMOLE_JSON_SECRET` | 32 hex chars — must match `guac-vault-stack/.env` |
| `PAM_DB_PASSWORD` | A real password (not the placeholder) |

Generate the Guacamole secret if you don't have one yet:

```bash
openssl rand -hex 16
```

Put the same value in both:
* `pam_project/.env` → `GUACAMOLE_JSON_SECRET`
* `guac-vault-stack/.env` → `GUAC_JSON_SECRET`

> **Note:** If these don't match, Guacamole shows *"Invalid login"* on the Connect redirect with no further explanation.

---

## 2. On the VM — Open Firewall Ports

**Ubuntu/Debian example:**
```bash
sudo ufw allow 3000/tcp      # frontend (proxies /api → backend)
sudo ufw allow 8080/tcp      # Keycloak
sudo ufw allow 8081/tcp      # Guacamole
# Port 8000 is internal to Docker Compose and does not need to be exposed.
```

**RHEL with firewalld:**
```bash
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --permanent --add-port=8081/tcp
sudo firewall-cmd --reload
```

---

## 3. Bring Up Supporting Stacks

### Vault + Guacamole

```bash
cd guac-vault-stack

# Vault, guacd, Guacamole, and its Postgres
docker compose up -d

# Vault re-seals on every restart — unseal it:
./unseal.sh
```

`unseal.sh` reads the unseal key from `vault-init.txt` and passes `VAULT_ADDR=http://127.0.0.1:8210` so the CLI talks to the right listener.

**Verify:**
```bash
docker exec -e VAULT_ADDR=http://127.0.0.1:8210 vault vault status | grep -E 'Sealed|Version'
# Expected: Sealed  false
```

If `Sealed` is `true`, Vault has not been unsealed — rerun `./unseal.sh`.

### Keycloak

```bash
cd ../keycloak
docker compose up -d
```

**Verify the issuer:**
Keycloak's issuer must match what the browser sees, or every JWT will fail validation on the backend with `401 Invalid issuer`:

```bash
curl -s http://<VM-IP>:8080/realms/pam/.well-known/openid-configuration | grep '"issuer"'
```

**Expected output:**
```text
"issuer": "http://192.168.1.36:8080/realms/pam"
```

If it says `localhost` instead, set `KC_HOSTNAME` to the VM IP in `keycloak/.env` and run `docker compose up -d --force-recreate keycloak`.

---

## 4. Configure the Keycloak Client

Open Keycloak admin from Windows:
* **URL:** `http://<VM-IP>:8080/admin`
* **Login:** `admin` / `admin`
* **Path:** `Clients` → `pam-app` → `Settings`

| Field | Value |
| :--- | :--- |
| **Valid redirect URIs** | `http://<VM-IP>:3000/*` |
| **Valid post logout redirect URIs** | `http://<VM-IP>:3000/*` |
| **Web origins** | `http://<VM-IP>:3000` |
| **PKCE Method** | `S256` (ignored when running over HTTP+IP) |

> **Important:** Keep the Group Membership mapper (`groups` claim on access token). Without it, every user lands on `/unauthorized`.
> See `KEYCLOAK-SETUP.md` for the full first-time walkthrough.

---

## 5. Onboard a Target Server

From `pam_project/` on the VM:

```bash
./scripts/subscribe-vm.sh <TARGET-IP> <ADMIN-USER> <CERT-USERS> [SSH-PORT]
```

**Examples:**
```bash
# Ubuntu target, one allowed Linux user
./scripts/subscribe-vm.sh 192.168.1.173 ubuntu oudai

# RHEL target, two allowed Linux users
./scripts/subscribe-vm.sh 192.168.1.174 ec2-user oudai,deploy
```

**What the script does:**
1. Copies the Vault CA public key to the target.
2. Installs it at `/etc/ssh/trusted-user-ca-keys.pem` (SELinux-labeled on RHEL).
3. Writes `/etc/ssh/sshd_config.d/90-vault-ca.conf`.
4. Creates `/etc/ssh/auth_principals/<user>` for each cert user.
5. Validates with `sshd -t`, then reloads `sshd`.
6. Merges the target into `PAM_TARGETS_JSON` in `.env`.
7. Recreates the backend so it picks up the new target.

> You'll be prompted for the target's SSH password and sudo password once.

**Verify target-side trust before touching the browser:**
```bash
ssh-keygen -q -t ed25519 -N "" -f /tmp/test-key -C test-cert

docker exec -i -e VAULT_ADDR=http://127.0.0.1:8210 \
  -e VAULT_TOKEN="$(grep 'Initial Root Token' ../guac-vault-stack/vault-init.txt | awk '{print $NF}')" \
  vault vault write -format=json ssh-client-signer/sign/dev-role - <<EOF \
  | jq -r .data.signed_key > /tmp/test-key-cert.pub
{"public_key":"$(cat /tmp/test-key.pub)","valid_principals":"oudai","ttl":"5m"}
EOF

ssh -o IdentitiesOnly=yes -i /tmp/test-key \
    -o CertificateFile=/tmp/test-key-cert.pub \
    oudai@<TARGET-IP>
```

A shell prompt means the target side works end-to-end. If it fails:

| Symptom | Check on the target |
| :--- | :--- |
| `Permission denied (publickey)` | `journalctl -u sshd -n 30` |
| `AuthorizedPrincipalsFile ... no such file` | `ls /etc/ssh/auth_principals/` |
| SELinux denial (RHEL) | `sudo ausearch -m avc -ts recent \| grep sshd` |

---

## 6. Start the PAM App

```bash
cd pam_project
docker compose up --build -d
docker compose ps
```

**Expected services:**
```text
pam-app-db      healthy
pam-backend     healthy
pam-frontend    running
```

> Wait for `pam-backend` to report healthy before opening the UI — `pam-frontend` depends on it.

---

## 7. Verify from Windows

| Check | URL |
| :--- | :--- |
| **Frontend config** | `http://<VM-IP>:3000/config.js` |
| **Frontend app** | `http://<VM-IP>:3000` |
| **Backend health (via nginx)** | `http://<VM-IP>:3000/health` |
| **Guacamole** | `http://<VM-IP>:8081/guacamole` |
| **Keycloak** | `http://<VM-IP>:8080` |

1. Open `http://<VM-IP>:3000` in Chrome or Edge → **Sign in with Keycloak**.
2. The login page shows the Keycloak URL it will use — it must be `http://<VM-IP>:8080`, not `localhost`.

**End-to-end flow:**
1. Sign in as a member of `pam_users`.
2. Submit a request: target IP, Linux user, justification, duration.
3. Sign in as a member of `approvers` (a different user).
4. Approve or reject with a comment.
5. Return to the requester, click **Connect**.
6. Guacamole opens a terminal to the target.

---

## 8. Troubleshooting

| Symptom | Likely Cause | Fix |
| :--- | :--- | :--- |
| **Login button does nothing** | `/config.js` wrong | Verify `http://<VM-IP>:3000/config.js` shows the VM IP |
| **Failed to fetch / CORS after login** | Stale frontend | `docker compose up -d --build frontend` |
| **401 on /api/me** | JWT issuer mismatch | Set `KC_HOSTNAME=<VM-IP>` in `keycloak/.env`, recreate |
| **Can't reach app from Windows** | Firewall blocking | Open ports 3000, 8080, 8081 (not 8000) |
| **Redirect error from Keycloak** | Missing redirect URI | Add `http://<VM-IP>:3000/*` in Keycloak client settings |
| **Web Crypto API is not available** | Plain HTTP + IP | Pull latest code; PKCE auto-disabled, crypto polyfilled |
| **Credential issuer is unavailable** | Vault sealed or unreachable | `cd guac-vault-stack && ./unseal.sh`, check `VAULT_ADDR` port |
| **Guacamole says "Invalid login"** | JSON secret mismatch | Match `GUAC_JSON_SECRET` and `GUACAMOLE_JSON_SECRET` |
| **Connect hangs then fails** | Host key rejection | Add `"host-key-check": "false"` to `guacamole.py` parameters |
| **Cert login rejected at target** | CA not trusted | Re-run `subscribe-vm.sh` for that target |

---

## 9. After Changing the VM IP

Edit `pam_project/.env`:
```bash
PUBLIC_HOST=<NEW-IP>
KEYCLOAK_PUBLIC_URL=http://<NEW-IP>:8080
FRONTEND_URL=http://<NEW-IP>:3000
GUACAMOLE_PUBLIC_URL=http://<NEW-IP>:8081/guacamole
VITE_KEYCLOAK_URL=http://<NEW-IP>:8080
VITE_API_BASE_URL=http://<NEW-IP>:3000
```

Edit `keycloak/.env`:
```bash
KC_HOSTNAME=<NEW-IP>
```

Recreate the affected stacks:
```bash
cd keycloak && docker compose up -d --force-recreate
cd ../pam_project && docker compose up -d --build --force-recreate frontend backend
```

Update Keycloak client redirect URIs for the new IP in the Admin UI.

---

## 10. Day-2 Operations

| Task | Command |
| :--- | :--- |
| **Unseal Vault after restart** | `cd guac-vault-stack && ./unseal.sh` |
| **Add a target** | `./scripts/subscribe-vm.sh <IP> <ADMIN> <USER[,USER2]>` |
| **Check Vault status** | `docker exec -e VAULT_ADDR=http://127.0.0.1:8210 vault vault status` |
| **Backend logs** | `docker compose logs -f backend` |
| **Recent requests** | `docker compose exec pam-db psql -U pam -d pam -c "SELECT id, status, requester_username, target_system FROM access_requests ORDER BY created_at DESC LIMIT 10;"` |
| **Re-register all targets** | `cat .env \| grep PAM_TARGETS_JSON` then rerun `subscribe-vm.sh` per IP |
