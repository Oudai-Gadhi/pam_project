# Deploy on Linux VM (browse from Windows)

Your VM has no browser. You develop/access from **Windows**; the VM runs Keycloak + this app.

```
Windows PC (browser)
    │
    ├── http://<VM-IP>:3000  →  Frontend (Docker)
    ├── http://<VM-IP>:8000  →  Backend (Docker, host network)
    └── http://<VM-IP>:8080  →  Keycloak (already on VM)
```

## 1. On the VM — clone and configure

```bash
git clone https://github.com/Oudai-Gadhi/pam_project.git
cd pam_project

# Replace 192.168.1.50 with YOUR VM IP (ip addr / hostname -I)
chmod +x scripts/setup-env.sh
./scripts/setup-env.sh 192.168.1.50
```

Or edit `.env` manually — **only `PUBLIC_HOST` must be your real VM IP**.

## 2. On the VM — open firewall ports

```bash
# Ubuntu/Debian example
sudo ufw allow 3000/tcp
sudo ufw allow 8000/tcp
# 8080 if not already open for Keycloak
sudo ufw allow 8080/tcp
```

## 3. Keycloak — update client for VM IP

In Keycloak Admin (from Windows: `http://<VM-IP>:8080/admin`):

**Clients → pam-app → Settings**

| Field | Value |
|-------|-------|
| Valid redirect URIs | `http://<VM-IP>:3000/*` |
| Web origins | `http://<VM-IP>:3000` |
| PKCE Method | S256 (optional — app skips PKCE on http://IP without HTTPS) |

Keep the **Group Membership** mapper (`groups` claim on access token).

### Keycloak hostname (important for login + JWT)

Tokens must use the same host your browser uses. On the VM, ensure Keycloak is reachable at `http://<VM-IP>:8080` and issues tokens with:

`iss = http://<VM-IP>:8080/realms/pam`

If tokens still show `iss: http://localhost:8080/...`, set Keycloak hostname to the VM IP, e.g. in your Keycloak service/env:

```bash
KC_HOSTNAME=<VM-IP>
KC_HOSTNAME_STRICT=false
KC_HTTP_ENABLED=true
```

Then restart Keycloak and verify:

```bash
curl -s http://<VM-IP>:8080/realms/pam/.well-known/openid-configuration | grep issuer
```

The issuer must match `KEYCLOAK_PUBLIC_URL/realms/pam` in `.env`.

## 4. On the VM — start the app

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f
```

## 5. On Windows — verify

| Check | URL |
|-------|-----|
| Frontend config | http://\<VM-IP\>:3000/config.js |
| Frontend app | http://\<VM-IP\>:3000 |
| Backend health | http://\<VM-IP\>:3000/health (proxied) or :8000 direct |
| Keycloak | http://\<VM-IP\>:8080 |

Open http://\<VM-IP\>:3000 in Chrome/Edge → **Sign in with Keycloak**.

The login page shows the Keycloak URL it will use — it must be `http://<VM-IP>:8080`, not `localhost`.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login button does nothing | Check http://\<VM-IP\>:3000/config.js — URLs must use VM IP |
| Failed to fetch / CORS after login | Pull latest — API is proxied via `:3000/api` (same origin). Run `docker compose up --build -d frontend` |
| 401 on /api/me after login | JWT `iss` mismatch — fix Keycloak `KC_HOSTNAME` to VM IP |
| Can't reach app from Windows | Firewall + VM network security group must allow 3000, 8000, 8080 |
| Redirect error from Keycloak | Add `http://<VM-IP>:3000/*` to client redirect URIs |
| Web Crypto API is not available | Pull latest code (PKCE auto-disabled on HTTP+IP), rebuild frontend |

## 7. After changing VM IP

```bash
./scripts/setup-env.sh <NEW-IP>
docker compose up --build -d
# Update Keycloak client redirect URIs too
```
