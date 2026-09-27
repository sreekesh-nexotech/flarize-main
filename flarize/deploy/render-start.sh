#!/usr/bin/env bash
# Start script for the Render (or any Docker) deployment.
#
# All platform state lives in ./data (JSON files). When a persistent disk is
# mounted (DATA_DISK, default /var/data) the shipped data/ seeds it on first
# boot and ./data becomes a symlink to the disk, so quotations, pack config,
# users and uploads survive restarts and redeploys. Without a disk the
# container's own copy is used and resets on every deploy/restart (fine for a
# throw-away test, not for real quotations).
set -euo pipefail
cd "$(dirname "$0")/.."

DISK="${DATA_DISK:-/var/data}"
if [ -d "$DISK" ]; then
  if [ -z "$(ls -A "$DISK")" ]; then
    echo "[start] seeding empty data disk $DISK from the shipped data/"
    cp -a data/. "$DISK"/
  fi
  if [ ! -L data ]; then
    rm -rf data
    ln -s "$DISK" data
  fi
  echo "[start] data -> $DISK"
else
  echo "[start] no data disk mounted — using the container's data/ (ephemeral)"
fi

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  echo "[start] FATAL: ADMIN_PASSWORD is not set (Render → Environment)"; exit 1
fi
exec node server.js
