# Keycloak setup from scratch (VM IP: 192.168.1.36)

Follow these steps **in order** on your VM and from **Windows Chrome/Edge**.

---

## Part A — Restart Keycloak with the correct hostname

Your current Keycloak container doesn't know about `192.168.1.36`. Recreate it:

```bash
docker stop keycloak
docker rm keycloak

docker run -d \
  --name keycloak \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  -e KC_HOSTNAME=192.168.1.36 \
  -e KC_HOSTNAME_STRICT=false \
  -e KC_HTTP_ENABLED=true \
  quay.io/keycloak/keycloak:26.7.4 \
  start-dev
```

Wait ~30 seconds, then from Windows open:

**http://192.168.1.36:8080**

You should see the Keycloak welcome page.

Admin console: **http://192.168.1.36:8080/admin**  
Login: `admin` / `admin`

---

## Part B — Create realm `pam`

1. Open http://192.168.1.36:8080/admin
2. Top-left dropdown says **master** → click it → **Create realm**
3. Realm name: `pam`
4. Click **Create**

You are now inside the `pam` realm (dropdown shows **pam**).

---

## Part C — Create groups

1. Left menu → **Groups**
2. Click **Create group**
   - Name: `pam_users` → **Save**
3. Click **Create group** again
   - Name: `approvers` → **Save**

---

## Part D — Create client `pam-app`

1. Left menu → **Clients** → **Create client**

**Step 1 — General settings**
- Client type: `OpenID Connect`
- Client ID: `pam-app`
- Click **Next**

**Step 2 — Capability config**
- Client authentication: **OFF** (public client)
- Authorization: OFF
- Authentication flow:
  - Standard flow: **ON**
  - Direct access grants: ON (optional, for curl tests)
- Click **Next**

**Step 3 — Login settings**
- Root URL: `http://192.168.1.36:3000`
- Home URL: `http://192.168.1.36:3000`
- Valid redirect URIs: `http://192.168.1.36:3000/*`
- Valid post logout redirect URIs: `http://192.168.1.36:3000/*`
- Web origins: `http://192.168.1.36:3000`
- Click **Save**

---

## Part E — Add `groups` claim to the access token (CRITICAL)

Without this, every user lands on `/unauthorized`.

1. **Clients** → click **pam-app**
2. Tab **Client scopes**
3. Click **pam-app-dedicated**
4. Click **Configure a new mapper** → **Group Membership**
5. Set:
   - Name: `groups`
   - Token Claim Name: `groups`
   - Full group path: **OFF**
   - Add to ID token: **ON**
   - Add to access token: **ON**
   - Add to userinfo: **ON**
6. Click **Save**

---

## Part F — Create a test user

1. Left menu → **Users** → **Create new user**
   - Username: `pam_user_1`
   - Email verified: ON (optional)
   - Click **Create**

2. Tab **Credentials** → **Set password**
   - Password: `Password1!` (or your choice)
   - Temporary: **OFF**
   - Click **Save**

3. Tab **Groups** → **Join group** → select `pam_users` → **Join**

---

## Part G — Configure the PAM app on the VM

```bash
cd pam_project
git pull

chmod +x scripts/setup-env.sh
./scripts/setup-env.sh 192.168.1.36

docker compose up --build -d
```

Verify config from Windows:

**http://192.168.1.36:3000/config.js**

Should show:
```javascript
keycloakUrl: "http://192.168.1.36:8080"
apiBaseUrl: "http://192.168.1.36:8000"
```

---

## Part H — Test from Windows

| URL | Expected |
|-----|----------|
| http://192.168.1.36:8000/health | `{"status":"ok"}` |
| http://192.168.1.36:3000 | Login page |
| http://192.168.1.36:8080/realms/pam/.well-known/openid-configuration | JSON with `"issuer":"http://192.168.1.36:8080/realms/pam"` |

1. Open http://192.168.1.36:3000
2. Click **Sign in with Keycloak**
3. Log in as `pam_user_1` / `Password1!`
4. You should land on **User Dashboard**

---

## "Web Crypto API is not available"

This happens because you access the app as **http://192.168.1.36** (plain HTTP + IP). Browsers block crypto unless it's HTTPS or localhost.

**Fix applied in code:** PKCE is skipped automatically on non-secure contexts.

After `git pull && docker compose up --build -d frontend`, login should work.

**Alternative (more secure):** SSH tunnel from Windows so you use localhost:
```powershell
ssh -L 3000:localhost:3000 -L 8080:localhost:8080 -L 8000:localhost:8000 user@192.168.1.36
```
Then open http://localhost:3000 (PKCE works, but Keycloak redirect URIs must also include `http://localhost:3000/*`).

---

## Quick checklist

- [ ] Keycloak recreated with `KC_HOSTNAME=192.168.1.36`
- [ ] Realm `pam` created
- [ ] Groups `pam_users` and `approvers` created
- [ ] Client `pam-app` with redirect `http://192.168.1.36:3000/*`
- [ ] Group mapper → `groups` on access token
- [ ] User `pam_user_1` in group `pam_users`
- [ ] App `.env` via `./scripts/setup-env.sh 192.168.1.36`
- [ ] `docker compose up --build -d`
- [ ] Issuer check: `curl -s http://192.168.1.36:8080/realms/pam/.well-known/openid-configuration | grep issuer`
