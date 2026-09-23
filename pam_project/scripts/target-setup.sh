#!/usr/bin/env bash
# Configure this host to trust Vault-signed SSH certificates.
# Works on Ubuntu 20.04+/22.04+ and RHEL/Rocky/Alma/CentOS 8/9.
# Idempotent — safe to re-run with new user lists.
set -euo pipefail

VAULT_CA=""
CERT_USERS=""

usage() {
  cat >&2 <<'EOF'
Usage: sudo target-setup.sh --vault-ca <file> --cert-users <u1,u2,...>

  --vault-ca    Vault SSH CA public key (vault_ca.pub)
  --cert-users  Comma-separated Linux accounts allowed to log in via certs
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault-ca)   VAULT_CA="$2";   shift 2 ;;
    --cert-users) CERT_USERS="$2"; shift 2 ;;
    -h|--help)    usage ;;
    *) echo "✗ Unknown option: $1" >&2; usage ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "✗ Run with sudo." >&2; exit 1; }
[[ -n "$VAULT_CA" && -n "$CERT_USERS" ]] || usage
[[ -r "$VAULT_CA" ]] || { echo "✗ Cannot read $VAULT_CA" >&2; exit 1; }
grep -qE '^ssh-(ed25519|rsa)' "$VAULT_CA" || { echo "✗ Not an SSH public key" >&2; exit 1; }

# ── Detect distro family ──────────────────────────────────────────────────────
DISTRO="unknown"; FAMILY="unknown"
if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  DISTRO="${ID:-unknown}"
fi
case "$DISTRO" in
  rhel|centos|rocky|almalinux|ol|fedora)  FAMILY=rhel ;;
  ubuntu|debian|linuxmint|pop)            FAMILY=debian ;;
  *)                                      FAMILY=unknown ;;
esac
echo "▶ Detected: ${PRETTY_NAME:-$DISTRO} (family=$FAMILY)"

# ── Ensure sshd_config includes sshd_config.d ─────────────────────────────────
if [[ -f /etc/ssh/sshd_config ]] && \
   ! grep -qE '^\s*Include\s+/etc/ssh/sshd_config\.d/\*\.conf' /etc/ssh/sshd_config; then
  echo "▶ Adding 'Include /etc/ssh/sshd_config.d/*.conf' to sshd_config"
  cp -a /etc/ssh/sshd_config "/etc/ssh/sshd_config.bak.$(date +%s)"
  sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
fi

# ── Install Vault CA + principals dir ─────────────────────────────────────────
echo "▶ Installing Vault SSH CA"
install -o root -g root -m 0644 "$VAULT_CA" /etc/ssh/trusted-user-ca-keys.pem
install -d -o root -g root -m 0755 /etc/ssh/auth_principals

# ── Per-user principals files ─────────────────────────────────────────────────
echo "▶ Writing /etc/ssh/auth_principals"
IFS=',' read -r -a USERS <<< "$CERT_USERS"
INSTALLED=()
for u in "${USERS[@]}"; do
  u="${u#"${u%%[![:space:]]*}"}"
  u="${u%"${u##*[![:space:]]}"}"
  [[ -z "$u" ]] && continue
  if ! id "$u" >/dev/null 2>&1; then
    echo "  ⚠ user '$u' does not exist on this host — skipping"
    continue
  fi
  printf '%s\n' "$u" > "/etc/ssh/auth_principals/$u"
  chown root:root "/etc/ssh/auth_principals/$u"
  chmod 0644      "/etc/ssh/auth_principals/$u"
  INSTALLED+=("$u")
  echo "  ✓ $u"
done
(( ${#INSTALLED[@]} > 0 )) || { echo "✗ No valid users were configured." >&2; exit 1; }

# ── sshd fragment ─────────────────────────────────────────────────────────────
echo "▶ Writing /etc/ssh/sshd_config.d/90-vault-ca.conf"
cat > /etc/ssh/sshd_config.d/90-vault-ca.conf <<'EOF'
# Managed by PAM onboarding.
PubkeyAuthentication yes
TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pem
AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u
LogLevel VERBOSE
EOF
chmod 0644 /etc/ssh/sshd_config.d/90-vault-ca.conf

# ── SELinux labeling (RHEL family only) ───────────────────────────────────────
if [[ "$FAMILY" == "rhel" ]] && command -v getenforce >/dev/null 2>&1; then
  ENFORCE_STATE="$(getenforce)"
  if [[ "$ENFORCE_STATE" != "Disabled" ]]; then
    echo "▶ Labeling CA file for SELinux (state=$ENFORCE_STATE)"
    if command -v semanage >/dev/null 2>&1; then
      semanage fcontext -a -t ssh_key_t /etc/ssh/trusted-user-ca-keys.pem 2>/dev/null \
        || semanage fcontext -m -t ssh_key_t /etc/ssh/trusted-user-ca-keys.pem 2>/dev/null \
        || true
      restorecon -v /etc/ssh/trusted-user-ca-keys.pem >/dev/null
    else
      restorecon -Rv /etc/ssh >/dev/null 2>&1 || true
    fi
  fi
fi

# ── Validate sshd config ──────────────────────────────────────────────────────
echo "▶ Validating sshd configuration"
if ! sshd -t; then
  rm -f /etc/ssh/sshd_config.d/90-vault-ca.conf
  echo "✗ sshd -t failed — reverted the new fragment" >&2
  echo "  Run 'sshd -T' to inspect the effective config." >&2
  exit 1
fi

# ── Detect and reload the right service ───────────────────────────────────────
if systemctl list-unit-files sshd.service >/dev/null 2>&1; then
  SSHD_SVC=sshd
elif systemctl list-unit-files ssh.service >/dev/null 2>&1; then
  SSHD_SVC=ssh
else
  echo "✗ Neither sshd.service nor ssh.service found" >&2
  exit 1
fi

echo "▶ Reloading $SSHD_SVC"
systemctl reload "$SSHD_SVC"

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "✅ Target configured."
echo "   Distro:      ${PRETTY_NAME:-$DISTRO} ($FAMILY)"
echo "   Service:     $SSHD_SVC"
echo "   Cert users:  ${INSTALLED[*]}"
echo "   Password SSH: unchanged (verify cert login first)"
