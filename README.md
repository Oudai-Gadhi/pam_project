# PAM Platform — Phase 1

Minimal production-shaped foundation for a Privileged Access Management (PAM) platform: Keycloak OIDC authentication, group-based routing, JWT-validated FastAPI backend, and Docker Compose for the app layer.

## Architecture (Phase 1)

```
Browser ──► React SPA (nginx :3000)
              │ keycloak-js (PKCE login)
              ▼
         Keycloak (:8080)          ← already running on this VM (not in Compose)
              │
              ▼ access token (groups claim)
         FastAPI backend (:8000)   ← host network, talks to Keycloak via localhost
              └── JWKS signature verification
```

**Security principle:** The frontend reads groups for UX routing only. The backend **always** verifies JWT signatures against Keycloak JWKS before trusting any claim.

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/) with Compose v2+ (Linux VM)
- **Keycloak already running** on this VM at `http://localhost:8080`
- Keycloak realm `pam`, client `pam-app`, and groups configured (see below)
- Ports **3000** and **8000** available on the host

## Project structure

```
pam-app/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── auth/
│       │   ├── jwt_validator.py
│       │   └── dependencies.py
│       └── routes/
│           ├── health.py
│           └── me.py
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── keycloak.js
        ├── context/
        │   └── KeycloakContext.jsx
        ├── api/
        │   └── client.js
        ├── components/
        │   ├── ProtectedRoute.jsx
        │   ├── Header.jsx
        │   └── GroupRedirect.jsx
        ├── pages/
        │   ├── Login.jsx
        │   ├── UserDashboard.jsx
        │   ├── ApproverDashboard.jsx
        │   ├── Unauthorized.jsx
        │   └── RolePicker.jsx
        └── styles/
            └── index.css
```

## Quick start

```bash
# Ensure Keycloak is already up on localhost:8080
curl -s http://localhost:8080/realms/pam/.well-known/openid-configuration | head

cp .env.example .env
docker compose up --build
```

| Service   | URL                          | Managed by Compose |
|-----------|------------------------------|--------------------|
| Frontend  | http://localhost:3000        | Yes                |
| Backend   | http://localhost:8000        | Yes (host network) |
| Keycloak  | http://localhost:8080        | No — external      |

---

## Keycloak configuration (required)

Keycloak is **not** started by this project. These steps apply to your existing Keycloak instance on this VM. The app assumes you have already done this, but here are the exact steps for reference:

### 1. Create realm

1. Open http://localhost:8080/admin and sign in.
2. Click the realm dropdown (top-left, shows **master**).
3. Click **Create realm** → Name: `pam` → **Create**.

### 2. Create groups

1. Go to **Groups** → **Create group**.
2. Create group: `pam_users`
3. Create group: `approvers`

### 3. Configure MFA (TOTP)

1. Go to **Authentication** → flow **browser**.
2. Ensure **OTP Form** is set to **Required** (or configure an OTP policy under **Authentication → Policies → OTP**).
3. Under **Realm settings → Login**, enable **User registration** only if needed.

### 4. Create client `pam-app`

1. Go to **Clients** → **Create client**.
2. **General settings**
   - Client type: **OpenID Connect**
   - Client ID: `pam-app`
3. **Capability config**
   - Client authentication: **OFF** (public client)
   - Standard flow: **ON**
   - Direct access grants: **ON** (enables curl testing)
4. **Login settings**
   - Valid redirect URIs: `http://localhost:3000/*`
   - Web origins: `http://localhost:3000`
   - PKCE Method: **S256**
5. Save.

### 5. Add groups claim to access token (CRITICAL)

Groups are **not** included in JWTs by default. You must add a mapper:

1. Go to **Clients** → `pam-app` → **Client scopes** tab.
2. Click **`pam-app-dedicated`** (the dedicated scope).
3. **Add mapper** → **By configuration** → **Group Membership**.
4. Configure:
   - Name: `groups`
   - Token Claim Name: `groups`
   - Full group path: **OFF**
   - Add to ID token: **ON**
   - Add to access token: **ON**
   - Add to userinfo: **ON**
5. Save.

> Without this mapper, users will always land on `/unauthorized` because the `groups` claim will be missing.

### 6. Create test users

#### User: `pam_user_1` (pam_users only)

1. **Users** → **Add user** → Username: `pam_user_1` → Save.
2. **Credentials** tab → Set password (e.g. `Password1!`) → Temporary: **OFF**.
3. **Groups** tab → Join group: `pam_users`.
4. **Required user actions** → configure OTP: user must enroll TOTP on first login.

#### User: `approver_1` (approvers only)

1. Create user `approver_1` with password, join group `approvers`.

#### User: `dual_role` (both groups — optional)

1. Create user `dual_role`, join both `pam_users` and `approvers`.

#### User: `no_role` (neither group — optional)

1. Create user `no_role` with no group membership.

For TOTP enrollment: on first login Keycloak prompts to scan a QR code with Google Authenticator (or similar).

---

## How to run

```bash
# From project root
cp .env.example .env
docker compose up --build

# Detached mode
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Environment variables

| Variable | Purpose |
|----------|---------|
| `KEYCLOAK_URL` | Backend JWKS fetch URL (`http://localhost:8080`) |
| `KEYCLOAK_PUBLIC_URL` | JWT `iss` validation URL (`http://localhost:8080`) |
| `VITE_KEYCLOAK_URL` | Browser-facing Keycloak URL (baked into frontend at build time) |
| `VITE_API_BASE_URL` | Backend URL as seen by the browser |

Everything runs on the same VM, so all URLs use `localhost`. The backend container uses **host network mode** so it can reach Keycloak at `localhost:8080` like a native process.

---

## How to test

### 1. Health check

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### 2. Frontend login flow

1. Open http://localhost:3000
2. Click **Sign in with Keycloak**
3. Log in as `pam_user_1` + TOTP → should land on `/dashboard/user`
4. Log out → returns to login page
5. Repeat with `approver_1` → `/dashboard/approver`
6. Repeat with `dual_role` → `/role-picker`
7. Repeat with `no_role` → `/unauthorized`

### 3. API with Bearer token (curl)

Obtain a token via direct grant (dev/testing only):

```bash
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/pam/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=pam-app" \
  -d "username=pam_user_1" \
  -d "password=Password1!" \
  -d "scope=openid" | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/me | jq
```

Expected response includes `"groups": ["pam_users"]`.

> Note: Direct grant may fail if MFA is enforced and no OTP is supplied. For MFA-protected users, copy the access token from browser DevTools → Application → Session Storage, or temporarily disable OTP requirement for curl testing.

### 4. Reject invalid tokens

```bash
curl -s -H "Authorization: Bearer invalid.token.here" http://localhost:8000/api/me
# HTTP 401
```

---

## Troubleshooting

### CORS errors in browser console

- Ensure `FRONTEND_URL=http://localhost:3000` in `.env` matches exactly how you access the SPA (no trailing slash).
- Rebuild backend after changing CORS settings: `docker compose up --build backend`.

### JWKS / issuer mismatch (401 on /api/me)

- Both `KEYCLOAK_URL` and `KEYCLOAK_PUBLIC_URL` should be `http://localhost:8080`.
- JWT `iss` must match: `http://localhost:8080/realms/pam`.
- Verify Keycloak is reachable from the VM: `curl http://localhost:8080/realms/pam/protocol/openid-connect/certs`
- Check backend logs: `docker compose logs backend`
- If backend cannot reach Keycloak, confirm `network_mode: host` is set in `docker-compose.yml` (required on Linux for localhost access from a container).

### Groups missing from token / always unauthorized

- Confirm the **Group Membership** mapper is on `pam-app-dedicated` scope.
- Token Claim Name must be exactly `groups`.
- **Add to access token** must be **ON**.
- User must be a member of `pam_users` or `approvers` group (not just role assignment).
- Decode token at https://jwt.io and verify `groups` array is present.

### Redirect loop after login

- Usually caused by rendering protected routes before `keycloak.init()` completes.
- This project waits for init in `KeycloakProvider` and `ProtectedRoute` — if you still see loops, clear browser cookies for `localhost` and retry.
- Ensure redirect URI `http://localhost:3000/*` is configured in Keycloak client.

### Backend cannot reach Keycloak (connection refused)

- Keycloak must be running **before** starting the app: `curl http://localhost:8080/health` or check your Keycloak service.
- Backend uses host networking — if you run the backend outside Docker (`uvicorn app.main:app`), `localhost:8080` works directly with no special config.

### Frontend shows wrong Keycloak URL

- Vite env vars are baked at **build time**. After changing `VITE_*` vars, rebuild:
  ```bash
  docker compose up --build frontend
  ```

---

## Phase 2+ extension points

| Future feature | Where to add |
|----------------|--------------|
| PAM request endpoints | `backend/app/routes/requests.py` + `require_group()` |
| Vault integration | `backend/app/services/vault.py` |
| Guacamole sessions | `backend/app/routes/sessions.py` |
| Real dashboards | Replace placeholder pages in `frontend/src/pages/` |

No refactoring of auth middleware is needed — `get_current_user` and `require_group` are ready for Phase 2.
#   p a m _ p r o j e c t  
 