#!/bin/sh
set -eu

# Inject runtime config so Keycloak URL can be changed without rebuilding the image
cat > /usr/share/nginx/html/config.js <<EOF
window.__PAM_CONFIG__ = {
  keycloakUrl: "${KEYCLOAK_PUBLIC_URL:-http://localhost:8080}",
  keycloakRealm: "${KEYCLOAK_REALM:-pam}",
  keycloakClientId: "${KEYCLOAK_CLIENT_ID:-pam-app}",
  apiBaseUrl: "${API_BASE_URL:-http://localhost:8000}",
};
EOF

exec nginx -g 'daemon off;'
