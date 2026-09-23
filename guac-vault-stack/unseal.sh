#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

UNSEAL_KEY=$(grep 'Unseal Key 1' vault-init.txt | awk '{print $NF}')

# Make sure vault is running
docker start vault 2>/dev/null || docker compose up -d vault
sleep 3

# Unseal
docker exec vault vault operator unseal "$UNSEAL_KEY"

# Show status
docker exec vault vault status | grep -E "Sealed|Storage|Version"
