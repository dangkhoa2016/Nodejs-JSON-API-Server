# json-api-server

A JSONPlaceholder-compatible REST API built with **Node.js built-ins only** — zero runtime dependencies. Uses `node:sqlite` for storage and a custom Redis client implemented over the raw RESP protocol via TCP sockets.

## Requirements

- **Node.js >= 22** (uses built-in `node:sqlite`)
- **Redis** (optional — rate limiting falls back to in-memory if unavailable)

## Quick Start

```bash
git clone <repo-url>
cd json-api-server

npm run db:setup   # create tables + seed data (required before first start)
npm start          # start server
# or with file watching for development:
npm run dev
```

> **Note:** Node 22 may show a warning that `node:sqlite` is experimental. This is harmless.

---

## Configuration

Environment files are loaded by `src/load-env.js` (auto-run via `src/config.js`). All existing files in the chain are loaded with `override: false` — `process.env` values and earlier files take precedence over later ones. System env vars always take highest priority (e.g. `PORT=5000 npm start`).

`NODE_ENV` defaults to `development` if not set. In **production**, `dotenv` is **completely skipped** — set environment variables through your deployment environment instead (systemd, Docker, Kubernetes, etc.).

| NODE_ENV            | dotenv | Fallback chain (tried in order) |
|---------------------|--------|----------------------------------|
| `development`       | ✅     | `.env` ← `.env.dev` ← `.env.development` |
| `production-local`  | ✅     | `.env.prod` ← `.env.production` |
| `test`              | ✅     | `.env.test` |
| `production`        | ❌ skipped | _(use system env vars)_ |

### Variables

| Variable               | Default     | Description                            |
|------------------------|-------------|----------------------------------------|
| `PORT`                 | `3000`      | Server port                            |
| `DB_PATH`              | `./storage/data.db` | SQLite database file path      |
| `REDIS_URL`            | _(none)_    | Redis connection URL (takes priority). Format: `redis://user:password@host:port/db` |
| `REDIS_HOST`           | `127.0.0.1` | Redis host                             |
| `REDIS_PORT`           | `6379`      | Redis port                             |
| `REDIS_DB`             | `0`         | Redis database index                   |
| `REDIS_PASSWORD`       | _(none)_    | Redis password (for `AUTH`)            |
| `RATE_LIMIT_ENABLED`   | `true`      | Enable/disable rate limiting           |
| `RATE_LIMIT_MAX`       | `100`       | Max requests per time window           |
| `DEBUG_SQL`            | `false`     | Log all SQL queries to stderr (`true`/`false`) |
| `RATE_LIMIT_WINDOW_MS` | `60000`     | Time window in milliseconds (default 1 min) |
| `SEED_API_BASE_URL`    | `https://jsonplaceholder.typicode.com` | Base URL for seed data API |
| `MAX_BODY_SIZE`        | `1048576`   | Max request body size in bytes (minimum 1) |

---

## API Endpoints

### Resources

| Method   | Path                        | Description                  |
|----------|-----------------------------|------------------------------|
| `GET`    | `/api/users`                | List all users               |
| `GET`    | `/api/users/:id`            | Get user by ID               |
| `GET`    | `/api/users/:id/posts`      | Posts by user                |
| `GET`    | `/api/users/:id/albums`     | Albums by user               |
| `GET`    | `/api/users/:id/todos`      | Todos by user                |
| `GET`    | `/api/posts`                | List all posts               |
| `GET`    | `/api/posts/:id`            | Get post by ID               |
| `GET`    | `/api/posts/:id/comments`   | Comments on post             |
| `GET`    | `/api/comments`             | List all comments            |
| `GET`    | `/api/albums`               | List all albums              |
| `GET`    | `/api/albums/:id/photos`    | Photos in album              |
| `GET`    | `/api/photos`               | List all photos              |
| `GET`    | `/api/todos`                | List all todos               |
| `POST`   | `/api/:table`               | Create a new resource        |
| `PUT`    | `/api/:table/:id`           | Replace resource entirely    |
| `PATCH`  | `/api/:table/:id`           | Partial update               |
| `DELETE` | `/api/:table/:id`           | Delete resource              |

### Query String Filtering

```bash
# Filter posts by userId
GET /api/posts?userId=1

# Filter todos by userId and completed status
GET /api/todos?userId=1&completed=false

# Filter comments by postId
GET /api/comments?postId=1
```

Filterable columns vary by table (e.g., `title`, `email`, `username`). The `completed` field accepts `true`/`false` strings.

### System Endpoints

| Path              | Description                          |
|-------------------|--------------------------------------|
| `GET /`           | API info with available endpoints    |
| `GET /api`        | API info (same as above)             |
| `GET /health`     | Server status (Redis, tables, rate limit config) |
| `GET /api/health` | Same as above                        |

---

## Response Headers

Every response includes CORS and rate-limit headers:

```
Access-Control-Allow-Origin: *
X-Powered-By: json-api-server/1.0
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 99
X-RateLimit-Reset:     58      ← seconds until window resets
X-RateLimit-Store:     redis   ← "redis" or "memory"
```

When the rate limit is exceeded, a `429 Too Many Requests` response is returned:

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 100 requests per 60s window.",
  "retryAfter": 45
}
```

---

## Examples

```bash
# List users
curl http://localhost:3000/api/users

# Create a new post
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "title": "Hello", "body": "World"}'

# Partial update
curl -X PATCH http://localhost:3000/api/posts/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title"}'

# Delete
curl -X DELETE http://localhost:3000/api/posts/1

# Health check
curl http://localhost:3000/health
```

---

## Architecture

```
json-api-server/
├── bin/
│   └── start.js                 # Entry point — loads .env via src/load-env.js, starts server
├── src/
│   ├── config.js                # Centralized config — auto-loads dotenv via load-env.js, exports camelCase
│   ├── sql-logger.js            # Shared Proxy wrappers — logs exec/prepare/run/get/all to stderr
│   ├── load-env.js              # Shared dotenv loader — auto-run on require, skips in production
│   ├── server.js                # HTTP server, routing, middleware, handlers
│   ├── database.js              # SQLite layer (node:sqlite) — CRUD operations (reads config.js)
│   ├── db/
│   │   ├── migrate.js           # Table creation (standalone via npm run db:migrate)
│   │   └── seed.js              # Fetches seed data from [JSONPlaceholder](https://jsonplaceholder.typicode.com) API, auto-runs migrate
│   ├── rate-limiter.js          # Rate limiter (Redis or in-memory fallback)
│   └── redis.js                 # Pure-Node Redis client via RESP protocol over TCP
├── tests/
│   ├── config/
│   │   └── config.test.js           # Config defaults and env var branches (6)
│   ├── db/
│   │   ├── database.test.js         # Database CRUD, pagination, search, sort (5)
│   │   ├── migrate.test.js          # Migration success and failure paths (2)
│   │   ├── seed.test.js             # Seed with real DB + mocked deps, JSONPlaceholder fetch (5)
│   │   └── sql-logger.test.js       # SQL query logger wrapping (5)
│   ├── middleware/
│   │   └── rate-limiter.test.js     # In-memory and Redis rate limiter paths (6)
│   ├── redis/
│   │   └── redis.test.js            # RESP protocol encoding/parsing, constructor options (25)
│   ├── server/
│   │   ├── coverage-printlog.test.js # V8 coverage: printLog, startServer, 500 catch (2)
│   │   ├── integration.test.js      # API integration tests — real HTTP + SQLite (50)
│   │   └── server.test.js           # Server request handler and startup paths (5)
│   ├── README.md                    # Testing documentation
│   └── helpers/
│       ├── coverage.js              # Test-coverage utilities (save/restore/setEnv/clearCjs)
│       ├── index.js                 # startServer / stopServer / request utilities
│       └── seed.js                  # Standalone script to create & seed temp DB
├── manual/
│   ├── curl.sh                  # Quick curl commands
│   └── inspect-queries.sql      # SQL queries for database inspection
├── storage/                     # SQLite database files (auto-created)
├── temp/                        # Temporary files (gitignored)
├── .env                         # Base configuration (tried first in development — highest priority)
├── .env.dev                     # Development fallback (tried if .env not found)
├── .env.test                    # Test configuration (port 3001, separate DB, no rate limit)
├── .env.prod.example            # Production template (copy to .env.prod)
├── .env.example                 # Reference for all available variables
├── package.json                 # Metadata and scripts
├── LICENSE                      # MIT license
├── README.md                    # Documentation
├── .gitignore                   # Git ignore rules
└── vitest.config.js             # Vitest test runner configuration
```

### Startup Flow

```
bin/start.js → src/load-env.js (loads .env per NODE_ENV, skipped in production)
  → src/server.js
      ├── src/config.js     (centralized config, auto-loads dotenv)
      ├── src/database.js   (SQLite CRUD)
      ├── src/redis.js      (pure RESP + AUTH + URL)
      └── src/rate-limiter.js (Redis || in-memory, config loaded lazily per call)

# Standalone scripts: npm run db:migrate / npm run db:seed / npm run db:setup (config.js loads dotenv automatically)
```

### Request Flow

```
HTTP Request → CORS headers → Rate limiter → Route parser → Handler → JSON Response
```

---

## Database

- **6 tables:** `users`, `posts`, `comments`, `albums`, `photos`, `todos`
- **WAL mode** for better concurrent read performance
- **Foreign keys** enforced via `PRAGMA foreign_keys=ON`
- **Seed data** fetched from [JSONPlaceholder](https://jsonplaceholder.typicode.com) on first run:
  - 10 users (with `address` and `company` stored as JSON, parsed on read)
  - 100 posts
  - 500 comments
  - 100 albums
  - 5000 photos
  - 200 todos

### Helper Script

```bash
sqlite3 storage/data.db < manual/inspect-queries.sql
```

This runs comprehensive queries to inspect row counts, column metadata, relationships, integrity checks, and statistics.

### Database Scripts

| Script        | Command                   | Description                                           |
|---------------|---------------------------|-------------------------------------------------------|
| `db:migrate`  | `npm run db:migrate`      | Creates the 6 tables (dotenv loaded by config.js)      |
| `db:seed`     | `npm run db:seed`         | Fetches seed data from [JSONPlaceholder](https://jsonplaceholder.typicode.com), auto-runs migrate |
| `db:setup`    | `npm run db:setup`        | Runs `db:seed` (which internally calls migrate)       |
| `test`        | `npm test`                | Run vitest integration tests                          |
| `test:coverage` | `npm run test:coverage` | Run tests with V8 coverage report                    |

---

## Testing

Uses **vitest** with **V8 native coverage**. 111 tests across 10 test files cover the full stack — from integration tests (real HTTP server + SQLite) to unit tests for every module.

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report (~92% statements, ~89% branches)
```

See [tests/README.md](tests/README.md) for full documentation.
---

## Implementation Notes

- **Zero runtime dependencies** — only Node.js built-in modules (`http`, `url`, `fs`, `path`, `net`, `node:sqlite`). `dotenv` is a dev dependency.
- **Pure RESP protocol** — the Redis client in `src/redis.js` implements the Redis serialization protocol over raw TCP sockets without any third-party library. Supports `AUTH` password authentication and `REDIS_URL` connection strings.
- **Centralized config** — all environment variables are read in `src/config.js` and exported as camelCase (`port`, `dbPath`, `redisOpts`, `rateLimitMax`, `dbDebugSql`, etc.) for use across the codebase.
- **Lazy rate-limiter config** — `src/rate-limiter.js` reads config inside `createRateLimiter()` (not at module level), allowing different config values per call and making unit testing straightforward.
- **Testable seed script** — `src/db/seed.js` accepts `database` and `fetch` parameters via dependency injection, enabling full unit testing without mocking `require()`.
- **SQL query logging** — `src/sql-logger.js` exports `wrapDb`/`wrapStmt` Proxy wrappers that log `exec`, `prepare`, `run`, `get`, and `all` calls to stderr. `src/database.js` uses them via `getWrappedDb()` when `DEBUG_SQL=true`.
- **Multi-environment** — `src/config.js` requires `src/load-env.js` at module level, which auto-loads dotenv using a priority chain based on `NODE_ENV`. Every consumer (server, migrate, seed) simply requires `config.js` and gets correct env values. In production, dotenv is skipped entirely — env vars must come from the deployment environment.
- **Lazy rate-limiter config** — `src/middleware/rate-limiter.js` reads config inside `createRateLimiter()` (not at module level), allowing different config values per call and making unit testing straightforward.
- **Testable seed script** — `src/db/seed.js` accepts `database` and `fetch` parameters via dependency injection, enabling full unit testing without mocking `require()`.
- **CORS** enabled on all routes
- **Graceful shutdown** — handles `SIGINT` and `SIGTERM` to close the server and Redis connection cleanly

## License

[MIT](LICENSE) — Copyright (c) 2026 Dang Khoa &lt;i.am@dangkhoa.dev&gt;
