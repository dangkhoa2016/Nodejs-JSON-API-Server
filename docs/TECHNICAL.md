# Technical Documentation

> 🌐 Language / Ngôn ngữ: **English** | [Tiếng Việt](TECHNICAL.vi.md)

> Architecture, implementation notes, and internal design of json-api-server.

## Architecture

```
json-api-server/
├── bin/
│   └── start.js                 # Entry point — loads .env via src/config/load-env.js, starts server
├── src/
│   ├── config/
│   │   ├── index.js              # Centralized config — auto-loads dotenv via load-env.js, exports camelCase
│   │   ├── load-env.js           # Shared dotenv loader — auto-run on require, skips in production
│   │   ├── runtime-config.js     # Thread-safe in-memory config overrides for runtime updates (rate-limit, Redis)
│   │   └── setting-defs.js       # Setting definitions for 14 env vars (NODE_ENV, PORT, ADMIN_KEY, etc.)
│   ├── db/
│   │   ├── index.js              # SQLite layer (node:sqlite) — CRUD operations (reads config)
│   │   ├── migrate.js            # Table creation (standalone via npm run db:migrate)
│   │   ├── seed.js               # Fetches seed data from JSONPlaceholder API, auto-runs migrate
│   │   ├── seed-settings.js      # Seeds 14 env vars (NODE_ENV, PORT, ADMIN_KEY, etc.) into settings table
│   │   └── sql-logger.js         # Shared Proxy wrappers — logs exec/prepare/run/get/all to stderr
│   ├── middleware/
│   │   └── rate-limiter.js       # Rate limiter (Redis/in-memory, circuit breaker, escalating blocks)
│   ├── redis/
│   │   └── index.js              # Pure-Node Redis client via RESP protocol over TCP
│   ├── public/
│   │   ├── favicon.ico           # Favicon (ICO format)
│   │   ├── favicon.png           # Favicon (PNG format)
│   │   └── license.md            # Flaticon license file
│   └── server/
│       ├── index.js              # HTTP server, graceful shutdown, startup orchestration
│       └── route.js              # Route parser, request handlers, admin auth, favicon, runtime config updates
├── tests/
│   ├── config/
│   │   ├── config.test.js           # Config defaults and env var branches (9)
│   │   └── load-env.test.js         # Load-env file loading chain and error paths (7)
│   ├── db/
│   │   ├── database.test.js         # Database CRUD, pagination, search, sort, SQL injection, cascade delete (11)
│   │   ├── migrate.test.js          # Migration success and failure paths (2)
│   │   ├── seed.test.js             # Seed with real DB + mocked deps, JSONPlaceholder fetch (5)
│   │   └── sql-logger.test.js       # SQL query logger wrapping (5)
│   ├── middleware/
│   │   └── rate-limiter.test.js     # In-memory, Redis, circuit breaker, proxy IPs, updateConfig (57)
│   ├── redis/
│   │   └── redis.test.js            # RESP protocol encoding/parsing, constructor options, eval, reconnect (33)
│   ├── server/
│   │   ├── coverage-printlog.test.js # Printlog and server export V8 coverage (4)
│   │   ├── graceful-shutdown.test.js # SIGINT/SIGTERM handler coverage (1)
│   │   ├── index.test.js            # Server request handler, admin auth, graceful shutdown (13)
│   │   ├── integration.test.js      # API integration tests — real HTTP + SQLite, runtime PATCH (81)
│   │   └── route.test.js            # Route parsing, favicon, health, admin auth cache, runtime config (18)
│   ├── README.md                    # Testing documentation (English)
│   ├── README.vi.md                 # Testing documentation (Vietnamese)
│   └── helpers/
│       ├── coverage.js              # Test-coverage utilities (save/restore/setEnv/clearCjs/configMockFactory)
│       ├── index.js                 # startServer / stopServer / request utilities
│       ├── mock-factory.js          # Mock factory helpers (mkDb/mkReq/mkRes/mkRedis/mkSettingsTable)
│       └── seed.js                  # Standalone script to create & seed temp DB
│   └── seed-settings-coverage.test.js  # Seed-settings.js V8 coverage (4)
├── manual/
│   ├── admin.sh                 # Admin panel curl commands
│   ├── albums.sh                # Albums endpoints
│   ├── comments.sh              # Comments endpoints
│   ├── curl.sh                  # Quick curl commands
│   ├── health.sh                # Health endpoint
│   ├── inspect-queries.sql      # SQL queries for database inspection
│   ├── inspect.sh               # Database inspection script
│   ├── inspect-docker-data.sh   # Docker data inspection script
│   ├── photos.sh                # Photos endpoints
│   ├── posts.sh                 # Posts endpoints
│   ├── todos.sh                 # Todos endpoints
│   └── users.sh                 # Users endpoints
├── manual-test-coverage/
│   ├── README.md                    # Coverage verification documentation
│   └── verify-commit-coverage.sh    # Coverage verification script
├── Dockerfile                   # Docker image definition
├── docker-entrypoint.sh         # Container entrypoint script
├── .dockerignore                # Docker ignore rules
├── storage/                     # SQLite database files (auto-created)
├── temp/                        # Temporary files (gitignored)
├── .env                         # Base configuration (tried first in development — highest priority)
├── .env.dev                     # Development fallback (tried if .env not found)
├── .env.test                    # Test configuration (port 3001, separate DB, no rate limit)
├── .env.prod.example            # Production template (copy to .env.prod)
├── .env.example                 # Reference for all available variables
├── package.json                 # Metadata and scripts
├── LICENSE                      # MIT license
├── README.md                    # Documentation (English)
├── README.vi.md                 # Documentation (Vietnamese)
├── .gitignore                   # Git ignore rules
└── vitest.config.js             # Vitest test runner configuration
```

### Startup Flow

```
bin/start.js → src/config/load-env.js (loads .env per NODE_ENV, skipped in production)
  → src/server/index.js
      ├── src/config/index.js     (centralized config, auto-loads dotenv)
      ├── src/db/index.js         (SQLite CRUD)
      ├── src/redis/index.js      (pure RESP + AUTH + URL)
      └── src/middleware/rate-limiter.js (Redis || in-memory, circuit breaker, escalating blocks)

# Standalone scripts: npm run db:migrate / npm run db:seed / npm run db:setup (config loads dotenv automatically)
```

### Request Flow

```
HTTP Request → CORS headers → Rate limiter → Route parser → Handler → JSON Response
```

---

## Implementation Notes

- **Minimal runtime dependencies** — only `argon2` for admin password hashing; everything else uses Node.js built-in modules (`http`, `url`, `fs`, `path`, `net`, `node:sqlite`). `dotenv` is a dev dependency.
- **Pure RESP protocol** — the Redis client in `src/redis/index.js` implements the Redis serialization protocol over raw TCP sockets without any third-party library. Supports `AUTH` password authentication and `REDIS_URL` connection strings.
- **Centralized config** — all environment variables are read in `src/config/index.js` and exported as camelCase (`port`, `dbPath`, `redisOpts`, `rateLimitMax`, `dbDebugSql`, `sensitiveKeys`, etc.) for use across the codebase.
- **Rate limiter** — `src/middleware/rate-limiter.js` features a circuit breaker for Redis failures, CIDR-based trusted proxy IP extraction, escalating block durations (5m → 20m → 1h), atomic Redis Lua scripts, and an in-memory fallback with LRU eviction. `createRateLimiter()` accepts options directly instead of reading config lazily.
- **Runtime configuration** — Patching rate-limit or Redis settings via the admin API immediately applies changes through `RuntimeConfig` (in-memory overrides), avoiding server restarts. Rate-limit hot-swapping uses `rateLimiter.updateConfig()`; Redis reconnection uses `Redis.reconnect()`.
- **Testable seed script** — `src/db/seed.js` accepts `database` and `fetch` parameters via dependency injection, enabling full unit testing without mocking `require()`.
- **SQL query logging** — `src/db/sql-logger.js` exports `wrapDb`/`wrapStmt` Proxy wrappers that log `exec`, `prepare`, `run`, `get`, and `all` calls to stderr. `src/db/index.js` uses them via `getWrappedDb()` when `DEBUG_SQL=true`.
- **Multi-environment** — `src/config/index.js` requires `src/config/load-env.js` at module level, which chain-loads all dotenv files in priority order with `override: false` — existing `process.env` values and earlier files take precedence over later ones. Every consumer (server, migrate, seed) simply requires `src/config/index.js` and gets correct env values. In production, dotenv is skipped entirely — env vars must come from the deployment environment.
- **SQL injection prevention** — `src/db/index.js` validates `_sort` against a whitelist of known columns and quotes identifiers with `""`; LIKE wildcards (`%`, `_`) are escaped to prevent injection through the `q` parameter
- **Argon2 auth cache** — `src/server/route.js` caches `ADMIN_KEY` verification results in a `Map` with 5-second TTL and 1,000-entry limit, avoiding repeated argon2 hashing on burst admin requests
- **CORS** enabled on all routes
- **Graceful shutdown** — handles `SIGINT` and `SIGTERM` to close the server and Redis connection cleanly
