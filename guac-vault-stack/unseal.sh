#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

UNSEAL_KEY=$(grep 'Unseal Key 1' vault-init.txt | awk '{print $NF}')

# Make sure vault is running
docker start vault 2>/dev/null || docker compose up -d vault
sleep 3

# Vault listens on 8210 with TLS disabled — see docker-compose.yaml
export VAULT_ADDR="http://127.0.0.1:8210"

# Unseal (pass VAULT_ADDR into the container)
docker exec \
  -e VAULT_ADDR="$VAULT_ADDR" \
  vault vault operator unseal "$UNSEAL_KEY"

# Show status
docker exec \
  -e VAULT_ADDR="$VAULT_ADDR" \
  vault vault status | grep -E "Sealed|Storage|Version"
