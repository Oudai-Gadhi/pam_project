# Keycloak Setup from Scratch

This guide assumes your VM's LAN IP is **192.168.1.36**. Replace it with yours everywhere it appears (`ip addr` or `hostname -I` on the VM).

> **Warning:** **If login redirects to the wrong IP** (e.g. `192.168.1.50`), your `.env` still has the old value. Edit `PUBLIC_HOST` in `pam_project/.env`, then run `docker compose up -d --force-recreate frontend`. If Keycloak itself is issuing tokens for the wrong host, set `KC_HOSTNAME` in `keycloak/.env` and recreate Keycloak.

Follow these steps **in order**. Parts A–F happen in the Keycloak admin UI. Part G wires the PAM app to it. Part H is the end-to-end test.

---

## Prerequisites

- Keycloak 26 running (see `keycloak/docker-compose.yaml`)
- `keycloak/.env` has a real `KC_DB_PASSWORD` and `KC_ADMIN_PASSWORD`
- The realm `pam` does **not** yet exist
- Windows PC can reach `http://192.168.1.36:8080`

*If the Keycloak database volume already exists and the realm is configured, you can skip to Part G.*

---

## Part A — Start Keycloak with the Correct Hostname

The hostname must match what the browser uses, or tokens will carry the wrong `iss` and every API call will return 401.

`keycloak/.env`:
```bash
KC_DB_NAME=keycloak
KC_DB_USER=keycloak
KC_DB_PASSWORD=change-me
KC_ADMIN_USER=admin
KC_ADMIN_PASSWORD=change-me
KC_HOSTNAME=192.168.1.36
```

**Start Keycloak:**
```bash
cd keycloak
docker compose up -d
```

Wait ~30 seconds. From Windows, open:
* `http://192.168.1.36:8080` — Welcome page
* `http://192.168.1.36:8080/admin` — Admin console

Log in with `KC_ADMIN_USER` / `KC_ADMIN_PASSWORD`.

**Verify the issuer:**
```bash
curl -s http://192.168.1.36:8080/realms/master/.well-known/openid-configuration \
  | grep '"issuer"'
```

**Expected:**
```json
"issuer": "http://192.168.1.36:8080/realms/master"
```

If it says `localhost`, `KC_HOSTNAME` didn't apply — recreate the container:
```bash
docker compose up -d --force-recreate keycloak
```

---

## Part B — Create the `pam` Realm

1. Open `http://192.168.1.36:8080/admin`.
2. Top-left dropdown shows `master` → click it → **Create realm**.
3. Realm name: `pam`.
4. Click **Create**.
5. The dropdown now shows `pam` — you're inside the new realm.

---

## Part C — Create Groups

1. Left menu → **Groups**.
2. **Create group** → name `pam_users` → **Save**.
3. **Create group** → name `approvers` → **Save**.
4. *(Optional)* Third group for future work: `superadmin`.

> Keep group names exact. The backend checks membership with `require_group("pam_users")` and `require_group("approvers")` — a typo means every user lands on `/unauthorized`.

---

## Part D — Create the `pam-app` Client

Left menu → **Clients** → **Create client**.

### Step 1 — General settings
| Field | Value |
| :--- | :--- |
| **Client type** | OpenID Connect |
| **Client ID** | `pam-app` |

Click **Next**.

### Step 2 — Capability config
| Field | Value |
| :--- | :--- |
| **Client authentication** | `OFF` (public client — SPA) |
| **Authorization** | `OFF` |
| **Standard flow** | `ON` |
| **Direct access grants** | `ON` (optional, for curl tests) |

Click **Next**.

### Step 3 — Login settings
| Field | Value |
| :--- | :--- |
| **Root URL** | `http://192.168.1.36:3000` |
| **Home URL** | `http://192.168.1.36:3000` |
| **Valid redirect URIs** | `http://192.168.1.36:3000/*` |
| **Valid post logout redirect URIs** | `http://192.168.1.36:3000/*` |
| **Web origins** | `http://192.168.1.36:3000` |

Click **Save**.

---

## Part E — Add the Groups Claim to the Access Token

Without this, `getGroupsFromToken()` returns `[]` and every user lands on `/unauthorized`.

1. **Clients** → click `pam-app`.
2. Tab **Client scopes** → click `pam-app-dedicated`.
3. **Configure a new mapper** → **Group Membership**.

| Field | Value |
| :--- | :--- |
| **Name** | `groups` |
| **Token Claim Name** | `groups` |
| **Full group path** | `OFF` |
| **Add to ID token** | `ON` |
| **Add to access token** | `ON` |
| **Add to userinfo** | `ON` |

Click **Save**.

**Verify:** Sign in as a test user (Part F), open DevTools → Application → Local Storage → `kc-token`, decode the JWT, look for `"groups": ["pam_users"]`.

---

## Part F — Create Test Users

### 1. Requester User
1. **Users** → **Create new user**.
2. Username: `pam_user_1`
3. Email verified: `ON`
4. Click **Create**.
5. **Credentials** → **Set password**:
   - Password: `Password1!`
   - Temporary: `OFF`
   - Click **Save**.
6. **Groups** → **Join group** → `pam_users` → **Join**.

### 2. Approver User
Repeat with:
- Username: `pam_approver_1`
- Password: `Password1!`
- Group: `approvers`

### 3. Dual Role User (Role Picker Test)
Create `pam_both_1`, join **both** groups (`pam_users` and `approvers`). This user is redirected to `/role-picker` at login and can switch between dashboards.

---

## Part G — Wire the PAM App to Keycloak

On the VM:
```bash
cd pam_project
# .env should already exist from DEPLOY-VM step 1
grep PUBLIC_HOST .env         # must be 192.168.1.36
grep KEYCLOAK_PUBLIC_URL .env # must be http://192.168.1.36:8080

docker compose up --build -d
docker compose ps
```

From Windows, verify the injected config: `http://192.168.1.36:3000/config.js`

```javascript
window.__PAM_CONFIG__ = {
  keycloakUrl: "http://192.168.1.36:8080",
  keycloakRealm: "pam",
  keycloakClientId: "pam-app",
  apiBaseUrl: "http://192.168.1.36:3000",
};
```

If `keycloakUrl` says `localhost` or the wrong IP, `PUBLIC_HOST` is wrong in `.env`. Fix it and recreate the frontend:
```bash
docker compose up -d --force-recreate frontend
```

---

## Part H — Test from Windows

| URL | Expected Result |
| :--- | :--- |
| `http://192.168.1.36:3000/config.js` | Config Object with VM IP |
| `http://192.168.1.36:3000` | Login Page |
| `http://192.168.1.36:3000/health` | `{"status":"ok"}` |
| `http://192.168.1.36:8080/realms/pam/.well-known/openid-configuration` | JSON with `"issuer":"http://192.168.1.36:8080/realms/pam"` |

### End-to-End Test Procedure:
1. Open `http://192.168.1.36:3000`.
2. Click **Sign in with Keycloak**.
3. Log in as `pam_user_1` / `Password1!` → Should land on **User Dashboard**.
4. Log out, log in as `pam_approver_1` → Should land on **Approver Dashboard**.

> **Note:** If you land on `/unauthorized`, the `groups` claim is missing from the token — re-check Part E.

---

## Known Issue: "Web Crypto API is not available"

This happens because you access the app as `http://192.168.1.36` — plain HTTP on a non-localhost host. Browsers block `crypto.subtle` and `crypto.randomUUID` outside secure contexts.

**The frontend handles this automatically:**
- `pkceMethod: false` when context is not secure.
- `crypto.randomUUID` polyfilled via `crypto.getRandomValues`.
- Silent SSO (`check-sso`) skipped on non-secure contexts.

*After pulling latest code, hard-refresh the browser (`Ctrl+Shift+R`).*

**Alternative — SSH Tunnel from Windows:**
```powershell
ssh -L 3000:localhost:3000 -L 8080:localhost:8080 user@192.168.1.36
```
Then open `http://localhost:3000`. PKCE works, `crypto.subtle` is available. Redirect URIs in Keycloak must also include `http://localhost:3000/*`.

---

## Quick Setup Checklist

- [ ] `KC_HOSTNAME=192.168.1.36` in `keycloak/.env`
- [ ] Realm `pam` created
- [ ] Groups `pam_users` and `approvers` created
- [ ] Client `pam-app` created with redirect `http://192.168.1.36:3000/*`
- [ ] Group mapper named `groups`, added to access token, full path `OFF`
- [ ] User `pam_user_1` added to `pam_users`
- [ ] User `pam_approver_1` added to `approvers`
- [ ] `PUBLIC_HOST=192.168.1.36` in `pam_project/.env`
- [ ] `docker compose up --build -d` executed in `pam_project/`
- [ ] Issuer URL returns VM IP via `curl`

---

## Getting a Token for `curl` Testing

Direct access grants must be enabled on `pam-app` (Part D).

```bash
TOKEN=$(curl -s -X POST \
  http://192.168.1.36:8080/realms/pam/protocol/openid-connect/token \
  -d 'grant_type=password' \
  -d 'client_id=pam-app' \
  -d 'username=pam_user_1' \
  -d 'password=Password1!' \
  | jq -r .access_token)

echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/devnull | jq '{preferred_username, groups}'
```

**Expected output:**
```json
{
  "preferred_username": "pam_user_1",
  "groups": [
    "pam_users"
  ]
}
```
*If `groups` is missing, the mapper in Part E is misconfigured.*
