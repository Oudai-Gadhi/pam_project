#!/usr/bin/env bash
# Register an Ubuntu SSH target for the JIT PAM lab.
# Run from the PAM application repository on pamvm. The caller must be able to
# SSH to the Ubuntu administrator account and that account must have sudo.
set -euo pipefail

usage() {
  echo "Usage: $0 <ubuntu-ip> <ubuntu-admin-user> <target-linux-user> [ssh-port]" >&2
  echo "Example: $0 192.168.0.50 ubuntu oudai" >&2
  exit 2
}

[[ $# -ge 3 && $# -le 4 ]] || usage

TARGET_IP="$1"
ADMIN_USER="$2"
TARGET_USER="$3"
TARGET_PORT="${4:-22}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CA_FILE="${VAULT_CA_FILE:-$PROJECT_DIR/../guac-vault-stack/vault_ca.pub}"

[[ "$TARGET_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || {
  echo "Only IPv4 addresses are supported by this onboarding script." >&2
  exit 1
}
[[ "$ADMIN_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid Ubuntu administrator username." >&2; exit 1; }
[[ "$TARGET_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo "Invalid target Linux username." >&2; exit 1; }
[[ "$TARGET_PORT" =~ ^[0-9]+$ ]] && (( TARGET_PORT >= 1 && TARGET_PORT <= 65535 )) || { echo "Invalid SSH port." >&2; exit 1; }
[[ -r "$CA_FILE" ]] || { echo "Vault CA file not found: $CA_FILE" >&2; exit 1; }
[[ -f "$PROJECT_DIR/.env" ]] || { echo "PAM app .env not found: $PROJECT_DIR/.env" >&2; exit 1; }
command -v ssh >/dev/null || { echo "ssh is required." >&2; exit 1; }
command -v scp >/dev/null || { echo "scp is required." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }

echo "Copying the Vault CA public key to $TARGET_IP..."
scp -P "$TARGET_PORT" "$CA_FILE" "$ADMIN_USER@$TARGET_IP:/tmp/vault_ca.pub"

echo "Configuring OpenSSH certificate trust on Ubuntu..."
ssh -p "$TARGET_PORT" "$ADMIN_USER@$TARGET_IP" "sudo bash -s -- '$TARGET_USER'" <<'REMOTE'
set -euo pipefail
target_user="$1"

id "$target_user" >/dev/null 2>&1 || {
  echo "Target Linux user does not exist: $target_user" >&2
  exit 1
}

install -d -o root -g root -m 0755 /etc/ssh/auth_principals
install -o root -g root -m 0644 /tmp/vault_ca.pub /etc/ssh/trusted-user-ca-keys.pem
printf '%s\n' "$target_user" > "/etc/ssh/auth_principals/$target_user"
chown root:root "/etc/ssh/auth_principals/$target_user"
chmod 0644 "/etc/ssh/auth_principals/$target_user"

cat > /etc/ssh/sshd_config.d/90-vault-ca.conf <<'EOF'
PubkeyAuthentication yes
TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pem
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
LogLevel VERBOSE
EOF

sshd -t
systemctl reload ssh
rm -f /tmp/vault_ca.pub
REMOTE

echo "Registering $TARGET_IP and $TARGET_USER in PAM_TARGETS_JSON..."
current_targets="$(sed -n 's/^PAM_TARGETS_JSON=//p' "$PROJECT_DIR/.env" | tail -n 1)"
[[ -n "$current_targets" ]] || current_targets='{}'
updated_targets="$(printf '%s' "$current_targets" | jq -c --arg ip "$TARGET_IP" --arg user "$TARGET_USER" --argjson port "$TARGET_PORT" '
  . + {
    ($ip): ((.[$ip] // {}) + {
      host: $ip,
      port: $port,
      users: (((.[$ip].users // []) + [$user]) | unique)
    })
  }
')"

temp_env="$(mktemp)"
trap 'rm -f "$temp_env"' EXIT
awk -v value="PAM_TARGETS_JSON=$updated_targets" '
  BEGIN { replaced = 0 }
  /^PAM_TARGETS_JSON=/ { print value; replaced = 1; next }
  { print }
  END { if (!replaced) print value }
' "$PROJECT_DIR/.env" > "$temp_env"
mv "$temp_env" "$PROJECT_DIR/.env"

echo "Reloading PAM backend with the registered target..."
(cd "$PROJECT_DIR" && docker compose up -d --force-recreate backend)

echo
echo "Ubuntu target added successfully. Users can now request:"
echo "  Target IP address: $TARGET_IP"
echo "  Target Linux user: $TARGET_USER"
echo
echo "Password SSH authentication was not changed. Prove certificate access before disabling it."
