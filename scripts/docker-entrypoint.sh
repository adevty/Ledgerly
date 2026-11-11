#!/bin/sh
set -e

# Ensure persistent /data directory is owned and writable by nextjs user
if [ -d "/data" ]; then
  chown -R nextjs:nodejs /data 2>/dev/null || true
  chmod 777 /data 2>/dev/null || true
fi

# Run the CMD as nextjs user if running as root, otherwise exec directly
if [ "$(id -u)" = "0" ]; then
  exec su-exec nextjs "$@"
else
  exec "$@"
fi
