#!/usr/bin/env bash
# Subscribe a target VM to the PAM platform.
# Run on pamvm. Prompts for the target's SSH + sudo password.
#
# Usage: ./subscribe-vm.sh <target-ip> <admin-user> <cert-users> [ssh-port]
# Example:
#   ./subscribe-vm.sh 192.168.1.174 oudai oudai,deploy
set -euo pipefail

[[ $# -ge 3 && $# -le 4 ]] || {
  echo "Usage: $0 <target-ip> <admin-user> <cert-users> [ssh-port]" >&2
  echo "Example: $0 192.168.1.174 oudai oudai,deploy" >&2
  exit 2
}

TARGET_IP="$1"
ADMIN_USER="$2"
CERT_USERS="$3"
TARGET_PORT="${4:-22}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
CA_FILE="${VAULT_CA_FILE:-$PROJECT_DIR/../guac-vault-stack/vault_ca.pub}"
TARGET_SCRIPT="$SCRIPT_DIR/target-setup.sh"
ENV_FILE="$PROJECT_DIR/.env"

[[ -r "$CA_FILE"       ]] || { echo "✗ Vault CA not found: $CA_FILE" >&2; exit 1; }
[[ -r "$TARGET_SCRIPT" ]] || { echo "✗ Missing: $TARGET_SCRIPT" >&2; exit 1; }
[[ -f "$ENV_FILE"      ]] || { echo "✗ .env not found: $ENV_FILE" >&2; exit 1; }

for cmd in scp ssh jq; do
  command -v "$cmd" >/dev/null || { echo "✗ Missing: $cmd" >&2; exit 1; }
done

# ── Push files to the target ──────────────────────────────────────────────────
echo "▶ Copying files to $ADMIN_USER@$TARGET_IP:/tmp/"
scp -P "$TARGET_PORT" \
    "$CA_FILE" \
    "$TARGET_SCRIPT" \
    "$ADMIN_USER@$TARGET_IP:/tmp/"

# ── Run the target-setup installer ────────────────────────────────────────────
# -t gives sudo a TTY to prompt for its password.
echo
echo "▶ Configuring target (sudo will prompt for a password)"
ssh -t -p "$TARGET_PORT" "$ADMIN_USER@$TARGET_IP" \
  "sudo bash /tmp/$(basename "$TARGET_SCRIPT") \
     --vault-ca   /tmp/$(basename "$CA_FILE") \
     --cert-users '$CERT_USERS'"

# ── Register in PAM_TARGETS_JSON ──────────────────────────────────────────────
echo
echo "▶ Registering $TARGET_IP in PAM_TARGETS_JSON"

current="$(sed -n 's/^PAM_TARGETS_JSON=//p' "$ENV_FILE" | tail -n 1)"
[[ -n "$current" ]] || current='{}'

users_json="$(printf '%s' "$CERT_USERS" \
  | jq -Rc 'split(",") | map(gsub("^\\s+|\\s+$";"")) | map(select(length>0))')"

updated="$(printf '%s' "$current" | jq -c \
  --arg       ip    "$TARGET_IP" \
  --argjson   port  "$TARGET_PORT" \
  --argjson   users "$users_json" \
  '. + {($ip): {host: $ip, port: $port, users: $users}}')"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
awk -v v="PAM_TARGETS_JSON=$updated" '
  BEGIN{replaced=0}
  /^PAM_TARGETS_JSON=/ {print v; replaced=1; next}
  {print}
  END{if(!replaced) print v}
' "$ENV_FILE" > "$tmp"
mv "$tmp" "$ENV_FILE"

# ── Restart backend so it picks up the new target ─────────────────────────────
echo "▶ Restarting backend"
(cd "$PROJECT_DIR" && docker compose up -d --force-recreate backend)

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "✅ $TARGET_IP subscribed"
echo "   Admin user: $ADMIN_USER"
echo "   Cert users: $CERT_USERS"
echo "   .env updated at: $ENV_FILE"
echo
echo "Password SSH unchanged. Test cert login before disabling it."
