#!/bin/sh
# MAVYRON container entrypoint.
#
# The platform mounts the persistent volume at DATA_DIR (default /data). A freshly
# attached volume is owned by root, while the application runs as the unprivileged
# "node" user. Prepare the directory as root, then drop privileges before starting
# the server so the SQLite database survives restarts and redeploys.
set -e

DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  exec su-exec node "$@"
fi

mkdir -p "$DATA_DIR" 2>/dev/null || true
exec "$@"
