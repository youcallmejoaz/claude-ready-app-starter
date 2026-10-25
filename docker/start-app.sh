#!/bin/sh
# Applies migrations (safe to run on every start, guarded by a lock), then starts the app.
set -e
if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  node dist/scripts/migrate.mjs
fi
exec node server.js
