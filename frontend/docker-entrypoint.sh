#!/bin/sh
set -eu

# PUBLIC_HOST is the VM IP Windows uses in the browser — must match Keycloak KC_HOSTNAME
HOST="${PUBLIC_HOST:?PUBLIC_HOST must be set in docker-compose environment}"

cat > /usr/share/nginx/html/config.js <<EOF
window.__PAM_CONFIG__ = {
  keycloakUrl: "http://${HOST}:8080",
  keycloakRealm: "${KEYCLOAK_REALM:-pam}",
  keycloakClientId: "${KEYCLOAK_CLIENT_ID:-pam-app}",
  apiBaseUrl: "http://${HOST}:8000",
};
EOF

echo "Wrote config.js for PUBLIC_HOST=${HOST}"
exec nginx -g 'daemon off;'
