#!/bin/sh
#
# Docker entrypoint for JSON API Server
#
# Runs database initialisation (migrate + seed) before handing off
# to the main application process.  All configuration is sourced
# from environment variables — no .env files are loaded in Docker
# because NODE_ENV=production skips dotenv entirely.
#
# Behaviour can be controlled via:
#   SKIP_DB_SETUP=true   — skip migrate / seed on container start
#   DEBUG_ENTRYPOINT     — print diagnostic info for troubleshooting
#

set -eu

# ── Logging helpers ──────────────────────────────────────────────
log()  { printf '[Entrypoint] %s\n' "$*"; }
warn() { printf '[Entrypoint] [WARN] %s\n' "$*" >&2; }
die()  { printf '[Entrypoint] [FATAL] %s\n' "$*" >&2; exit 1; }

# ── Diagnostics ──────────────────────────────────────────────────
log "Node.js $(node --version)"

if [ "${DEBUG_ENTRYPOINT:-}" = "true" ]; then
  log "NODE_ENV  = ${NODE_ENV:-<unset>}"
  log "DB_PATH   = ${DB_PATH:-<unset>}"
  log "ADMIN_KEY = $( [ -n "${ADMIN_KEY:-}" ] && echo 'set' || echo 'not set' )"
  log "REDIS_URL = $( [ -n "${REDIS_URL:-}" ] && echo 'set' || echo 'not set' )"
fi

# ── Environment validation ───────────────────────────────────────
if [ -z "${DB_PATH:-}" ]; then
  die "DB_PATH is required but was not set. Define it in the Dockerfile or pass it at runtime."
fi

if [ -z "${ADMIN_KEY:-}" ]; then
  warn "ADMIN_KEY is not set — admin routes will be disabled at runtime."
fi

# ── Database initialisation ──────────────────────────────────────
if [ "${SKIP_DB_SETUP:-}" = "true" ]; then
  log "SKIP_DB_SETUP is set — skipping database setup."
else
  log "Running database setup (migrate + seed)..."

  if ! npm run db:setup; then
    die "Database setup failed. Check the logs above for details."
  fi

  log "Database setup completed."
fi

# ── Runtime — hand off to CMD ────────────────────────────────────
# exec replaces the shell so that signals (SIGTERM from docker stop)
# go directly to the Node process, enabling graceful shutdown.
log "Starting server..."
exec "$@"
