#!/bin/sh
set -eu

HOST="${PUBLIC_HOST:?PUBLIC_HOST must be set in docker-compose environment}"

# API calls go to the same origin (port 3000); nginx proxies /api/* to the backend on :8000
cat > /usr/share/nginx/html/config.js <<EOF
window.__PAM_CONFIG__ = {
  keycloakUrl: "http://${HOST}:8080",
  keycloakRealm: "${KEYCLOAK_REALM:-pam}",
  keycloakClientId: "${KEYCLOAK_CLIENT_ID:-pam-app}",
  apiBaseUrl: "http://${HOST}:3000",
};
EOF

echo "Wrote config.js for PUBLIC_HOST=${HOST} (API via same origin :3000/api)"
exec nginx -g 'daemon off;'
