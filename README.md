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
| `RATE_LIMIT_WINDOW_MS` | `60000`     | Time window in milliseconds (default 1 min) |

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
│   ├── load-env.js              # Shared dotenv loader (auto-run on require, skips in production)
│   ├── server.js                # HTTP server, routing, middleware, handlers
│   ├── database.js              # SQLite layer (node:sqlite) — CRUD operations (reads config.js)
│   ├── db/
│   │   ├── migrate.js           # Table creation (standalone via npm run db:migrate)
│   │   └── seed.js              # Hardcoded seed data (standalone via npm run db:seed)
│   ├── rate-limiter.js          # Rate limiter (Redis or in-memory fallback)
│   └── redis.js                 # Pure-Node Redis client via RESP protocol over TCP
├── tests/
│   └── test.js                  # Integration tests
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
└── .gitignore                   # Git ignore rules
```

### Startup Flow

```
bin/start.js → src/load-env.js (loads .env per NODE_ENV, skipped in production)
  → src/server.js
      ├── src/config.js     (centralized config, auto-loads dotenv)
      ├── src/database.js   (SQLite CRUD)
      ├── src/redis.js      (pure RESP + AUTH + URL)
      └── src/rate-limiter.js (Redis || in-memory)

# Standalone scripts: npm run db:migrate / npm run db:seed / npm run db:setup
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
- **Seed data** initialized via `npm run db:seed` (hardcoded on first run):
  - 5 users (with `address` and `company` stored as JSON, parsed on read)
  - 50 posts (10 per user)
  - 250 comments (5 per post)
  - 10 albums (2 per user)
  - 50 photos (5 per album)
  - 20 todos (4 per user, `completed` stored as 0/1 integer, returned as boolean)

### Helper Script

```bash
sqlite3 storage/data.db < manual/inspect-queries.sql
```

This runs comprehensive queries to inspect row counts, column metadata, relationships, integrity checks, and statistics.

### Database Scripts

| Script       | Command                  | Description                                           |
|--------------|--------------------------|-------------------------------------------------------|
| `db:migrate` | `npm run db:migrate`     | Creates the 6 tables (idempotent — uses IF NOT EXISTS) |
| `db:seed`    | `npm run db:seed`        | Inserts hardcoded seed data (skips if already seeded)  |
| `db:setup`   | `npm run db:setup`       | Runs migrate then seed (convenience for first setup)   |

---

## Testing

```bash
# Start server in test mode (uses .env.test: port 3001, separate DB, no rate limit)
NODE_ENV=test npm start &

# Run tests (they connect to localhost:3000 by default)
npm test
# or
node tests/test.js
```

The integration test automatically verifies all endpoints, including CRUD operations, nested routes, filtering, rate-limit headers, and 404 handling.

---

## Implementation Notes

- **Zero runtime dependencies** — only Node.js built-in modules (`http`, `url`, `fs`, `path`, `net`, `node:sqlite`). `dotenv` is a dev dependency.
- **Pure RESP protocol** — the Redis client in `src/redis.js` implements the Redis serialization protocol over raw TCP sockets without any third-party library. Supports `AUTH` password authentication and `REDIS_URL` connection strings.
- **Centralized config** — all environment variables are read in `src/config.js` and exported as camelCase (`port`, `dbPath`, `redisOpts`, `rateLimitMax`, etc.) for use across the codebase.
- **Shared env loader** — `src/load-env.js` is auto-run on require by `src/config.js`. It loads environment-specific `.env` files based on `NODE_ENV` using a priority chain (development tries `.env` → `.env.dev` → `.env.development`). In production, dotenv is skipped entirely — env vars must come from the deployment environment. Both `bin/start.js` and any script requiring `config.js` get correct env values automatically.
- **CORS** enabled on all routes
- **Graceful shutdown** — handles `SIGINT` and `SIGTERM` to close the server and Redis connection cleanly

## License

[MIT](LICENSE) — Copyright (c) 2026 Dang Khoa &lt;i.am@dangkhoa.dev&gt;
