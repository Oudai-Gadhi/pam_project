#!/usr/bin/env bash
# Generates .env for VM deployment — run on the Linux server, not on Windows.
set -eu

PUBLIC_HOST="${1:-}"

if [ -z "$PUBLIC_HOST" ]; then
  read -r -p "Enter this VM's IP or hostname (as seen from your Windows PC): " PUBLIC_HOST
fi

if [ -z "$PUBLIC_HOST" ]; then
  echo "Error: PUBLIC_HOST is required." >&2
  exit 1
fi

cat > .env <<EOF
PUBLIC_HOST=${PUBLIC_HOST}

KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_PUBLIC_URL=http://${PUBLIC_HOST}:8080
KEYCLOAK_REALM=pam
KEYCLOAK_CLIENT_ID=pam-app

BACKEND_PORT=8000
FRONTEND_URL=http://${PUBLIC_HOST}:3000
LOG_LEVEL=INFO

VITE_KEYCLOAK_URL=http://${PUBLIC_HOST}:8080
VITE_KEYCLOAK_REALM=pam
VITE_KEYCLOAK_CLIENT_ID=pam-app
VITE_API_BASE_URL=http://${PUBLIC_HOST}:8000
EOF

echo "Created .env with PUBLIC_HOST=${PUBLIC_HOST}"
echo ""
echo "Next: configure Keycloak client pam-app with:"
echo "  Valid redirect URIs:  http://${PUBLIC_HOST}:3000/*"
echo "  Web origins:            http://${PUBLIC_HOST}:3000"
echo ""
echo "Then run: docker compose up --build -d"
