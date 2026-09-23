#!/usr/bin/env bash
set -euo pipefail
umask 077

# ===== EDIT THESE =====
TARGET_HOST="192.168.0.176"            # RHEL target IP or DNS name
TARGET_USER="oudai"                 # Linux account allowed to log in
TARGET_SSH_PORT="22"
# Leave empty for the first test if unsure. Otherwise e.g. "10.10.10.15/32".
SOURCE_ADDRESS_CIDR=""
# ======================

VAULT_TOKEN="${VAULT_TOKEN:-root}"  # Lab only. Do not use root in production.
VAULT_ADDR="http://127.0.0.1:8200"
VAULT_MOUNT="ssh-client-signer"
VAULT_ROLE="dev-role"
WORKDIR="$HOME/pam-platform/guac-vault-stack/pam-jit-test"
CERT_TTL="30m"
MAX_CERT_TTL="1h"

for cmd in docker ssh-keygen jq scp; do
  command -v "$cmd" >/dev/null || {
    echo "Missing required command: $cmd"
    exit 1
  }
done

cd "$HOME/pam-platform/guac-vault-stack"
VAULT_CONTAINER="$(docker compose ps -q vault)"

if [[ -z "$VAULT_CONTAINER" ]]; then
  echo "Vault container is not running. Start the stack first: docker compose up -d"
  exit 1
fi

mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"

vault_exec() {
  docker exec -i \
    -e "VAULT_ADDR=$VAULT_ADDR" \
    -e "VAULT_TOKEN=$VAULT_TOKEN" \
    "$VAULT_CONTAINER" vault "$@"
}

echo "1/5 Exporting the Vault SSH CA public key..."
vault_exec read -field=public_key "$VAULT_MOUNT/config/ca" \
  > "$WORKDIR/vault_ca.pub"
chmod 644 "$WORKDIR/vault_ca.pub"

echo "2/5 Configuring constrained signing role: $VAULT_ROLE..."
ROLE_JSON="$(jq -n \
  --arg allowed_users "$TARGET_USER" \
  --arg ttl "$CERT_TTL" \
  --arg max_ttl "$MAX_CERT_TTL" \
  '{
    key_type: "ca",
    allow_user_certificates: true,
    allowed_users: $allowed_users,
    ttl: $ttl,
    max_ttl: $max_ttl,
    allowed_critical_options: "source-address",
    default_extensions: {
      "permit-pty": ""
    }
  }')"

printf '%s\n' "$ROLE_JSON" | vault_exec write "$VAULT_MOUNT/roles/$VAULT_ROLE" -

echo "3/5 Creating an ephemeral test key..."
TEST_KEY="$WORKDIR/pam-test-key"
rm -f "$TEST_KEY" "$TEST_KEY.pub" "$TEST_KEY-cert.pub"
ssh-keygen -q -t ed25519 -N "" \
  -C "pam-jit-test" \
  -f "$TEST_KEY"

KEY_ID="pam-test-$(date -u +%Y%m%dT%H%M%SZ)"

SIGN_JSON="$(jq -n \
  --arg public_key "$(cat "$TEST_KEY.pub")" \
  --arg principal "$TARGET_USER" \
  --arg ttl "$CERT_TTL" \
  --arg source_address "$SOURCE_ADDRESS_CIDR" \
  '{
    public_key: $public_key,
    valid_principals: $principal,
    ttl: $ttl
  }
  + if $source_address == "" then {}
    else { critical_options: { "source-address": $source_address } }
    end')"

echo "4/5 Requesting a short-lived SSH certificate from Vault..."
printf '%s\n' "$SIGN_JSON" \
  | vault_exec write -format=json "$VAULT_MOUNT/sign/$VAULT_ROLE" - \
  | jq -r '.data.signed_key' \
  > "$TEST_KEY-cert.pub"

chmod 600 "$TEST_KEY" "$TEST_KEY-cert.pub"

echo "5/5 Certificate details:"
ssh-keygen -Lf "$TEST_KEY-cert.pub"

echo
echo "CA public key to copy to RHEL:"
echo "  $WORKDIR/vault_ca.pub"
echo
echo "Copy it to the target:"
echo "  scp -P $TARGET_SSH_PORT \"$WORKDIR/vault_ca.pub\" USER@$TARGET_HOST:/tmp/vault_ca.pub"
echo
echo "After configuring the target, test from this PAM VM:"
echo "  ssh -p $TARGET_SSH_PORT -o IdentitiesOnly=yes \\"
echo "    -i \"$TEST_KEY\" \\"
echo "    -o CertificateFile=\"$TEST_KEY-cert.pub\" \\"
echo "    $TARGET_USER@$TARGET_HOST"
