# json-api-server

> 🌐 Language / Ngôn ngữ: **English** | [Tiếng Việt](README.vi.md)

A JSONPlaceholder-compatible REST API built mostly with **Node.js built-ins** — the only runtime dependency is `argon2` for admin password hashing. Uses `node:sqlite` for storage and a custom Redis client implemented over the raw RESP protocol via TCP sockets.

## Technologies Used

- **Node.js >= 22** — runtime with built-in `node:sqlite`, `node:http`, `node:net`, etc.
- **node:sqlite** — SQLite database engine (built-in)
- **node:http** — HTTP server (built-in, no Express/Fastify)
- **node:net** — raw TCP sockets for custom Redis RESP client (built-in)
- **argon2** — secure password hashing for admin authentication (only runtime dependency)
- **RESP protocol** — custom Redis client implementing the Redis Serialization Protocol over TCP
- **dotenv** — environment file loading (dev dependency only, skipped in production)
- **vitest** — test runner with V8 native coverage (dev dependency)

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

## Docker

### Build

```bash
docker build -t json-api-server .
```

### Run

```bash
docker run -d -p 3000:3000 -v ./storage:/app/storage --name json-api-server json-api-server
```

The entrypoint automatically runs `npm run db:setup` (migrate + seed) on container start.

### Environment Variables

```bash
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e ADMIN_KEY=my-secret-key \
  -e REDIS_HOST=redis \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

### Notes

- The container runs as a non-root `app` user.
- Database files persist in `/app/storage` (declared as a `VOLUME`).
- `NODE_ENV=production` is set by default — dotenv is **skipped**, so all config must come via environment variables (see below).
- `.env` and `.env.*` files are **excluded** by `.dockerignore` and are **not copied** into the image.
- The entrypoint runs `npm run db:setup` on container start.

### Environment Configuration

The container runs with `NODE_ENV=production`, where `src/config/load-env.js` **skips dotenv entirely**. Combined with `.dockerignore` excluding all `.env*` files, you **must** pass configuration through Docker environment variables.

**Recommended**: pass variables explicitly:

```bash
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e ADMIN_KEY=my-secret-key \
  -e REDIS_HOST=redis \
  -e SEED_API_BASE_URL=https://jsonplaceholder.typicode.com \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

**Alternative — mount an env file** (only works with `NODE_ENV=production-local`):

```bash
docker run -d -p 3000:3000 \
  -e NODE_ENV=production-local \
  -v ./.env.prod:/app/.env.prod \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

> **Note:** Node 22 may show a warning that `node:sqlite` is experimental. This is harmless.

---

## Configuration

Environment files are loaded by `src/config/load-env.js` (auto-run via `src/config/index.js`). All existing files in the chain are loaded with `override: false` — `process.env` values and earlier files take precedence over later ones. System env vars always take highest priority (e.g. `PORT=5000 npm start`).

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
| `DEFAULT_PAGE_SIZE`   | `10`        | Default number of results per page for `_page`/`_limit` pagination |
| `ADMIN_KEY`           | _(none)_    | Master key to authenticate admin API requests (Bearer token) |
| **Runtime updates**   | —           | Patching `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, or `REDIS_PASSWORD` via the admin API applies changes immediately — no server restart needed |

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

> **Cascade deletes**: Deleting a `user` removes their `posts`, `albums`, and `todos`. Deleting a `post` removes its `comments`. Deleting an `album` removes its `photos`.

### Query String Filtering & Pagination

```bash
# Filter posts by userId
GET /api/posts?userId=1

# Filter todos by userId and completed status
GET /api/todos?userId=1&completed=false

# Filter comments by postId
GET /api/comments?postId=1
```

Filterable columns vary by table (e.g., `title`, `email`, `username`). The `completed` field accepts `true`/`false` strings.

### Pagination

| Param     | Description                                    | Example                      |
|-----------|------------------------------------------------|------------------------------|
| `_page`   | Page number (1-based), used with `_limit`      | `?_page=1&_limit=10`        |
| `_limit`  | Items per page (default: `DEFAULT_PAGE_SIZE`)  | `?_page=2&_limit=5`         |
| `_start`  | Offset index for slicing                       | `?_start=10&_end=20`        |
| `_end`    | End index (exclusive) for slicing              | `?_start=0&_end=5`          |

### Search

Search across text columns using the `q` parameter. Searchable columns vary by table:

| Table      | Searchable columns                        |
|------------|-------------------------------------------|
| `users`    | `name`, `username`, `email`               |
| `posts`    | `title`, `body`                           |
| `comments` | `name`, `email`, `body`                   |
| `albums`   | `title`                                   |
| `photos`   | `title`                                   |
| `todos`    | `title`                                   |

```bash
# Search posts by title or body
GET /api/posts?q=first

# Combine search with filter
GET /api/posts?q=Post&userId=1

# Search todos
GET /api/todos?q=groceries
```

### Sorting

| Param    | Values         | Description                          |
|----------|----------------|--------------------------------------|
| `_sort`  | column name    | Column to sort by                    |
| `_order` | `asc` / `desc` | Sort direction (default: `asc`)      |

```bash
# Sort posts by title ascending
GET /api/posts?_sort=title&_order=asc

# Sort posts by title descending
GET /api/posts?_sort=title&_order=desc

# Combine sort with pagination
GET /api/posts?_sort=id&_order=desc&_limit=2
```

### System Endpoints

| Path                              | Description                          |
|-----------------------------------|--------------------------------------|
| `GET /`                           | API info with available endpoints    |
| `GET /api`                        | API info (same as above)             |
| `GET /health`                     | Server status (Redis, tables, rate limit config) |
| `GET /api/health`                 | Same as above                        |
| `GET /api/admin/settings`         | List all settings (requires auth)    |
| `PATCH /api/admin/settings/:key`  | Update a setting value — rate-limit & Redis changes take **immediate effect** at runtime (requires auth) |
| `POST /api/admin/reset-database`  | Clear data tables and re-seed from JSONPlaceholder (requires auth) |

### Admin API

Admin endpoints are protected by Bearer token authentication using the `ADMIN_KEY` environment variable. Settings values are stored in the `settings` database table.

```bash
# List all settings
curl http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer my-secret-key"

# Update a setting
curl -X PATCH http://localhost:3000/api/admin/settings/NODE_ENV \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"value": "production"}'

# Reset database (clears all data and re-fetches from JSONPlaceholder)
curl -X POST http://localhost:3000/api/admin/reset-database \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

The `ADMIN_KEY` is hashed with **argon2** before storage. When updating the password via `PATCH /api/admin/settings/ADMIN_KEY`, the new value is automatically hashed. Passwords are never stored in plaintext.

**Runtime configuration updates**: When patching rate-limit settings (`RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) or Redis connection settings (`REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`, `REDIS_URL`), the server applies the changes immediately via the `RuntimeConfig` class — no restart required. Rate-limit changes call `rateLimiter.updateConfig()` to hot-swap the middleware's behavior, while Redis settings trigger a graceful reconnect through `Redis.reconnect()`.

Argon2 verification results are **cached in-memory for 5 seconds** per token, avoiding repeated hashing on consecutive admin requests. On error, the result is also cached as invalid — preventing timing or error-message side-channel leaks.

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

```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 0
X-RateLimit-Reset:     0
X-RateLimit-Store:     redis
Retry-After:           300
```

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Max 100 requests per 60s window.",
  "retryAfter": 300
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

See [docs/TECHNICAL.md](docs/TECHNICAL.md) for detailed architecture and implementation notes.

## Database

- **7 tables:** `users`, `posts`, `comments`, `albums`, `photos`, `todos`, `settings`
- **WAL mode** for better concurrent read performance
- **Foreign keys** enforced via `PRAGMA foreign_keys=ON`
- **Seed data** fetched from [JSONPlaceholder](https://jsonplaceholder.typicode.com) on first run:
  - 10 users (with `address` and `company` stored as JSON, parsed on read)
  - 100 posts
  - 500 comments
  - 100 albums
  - 5000 photos
  - 200 todos
  - 14 settings (environment variables: `NODE_ENV`, `PORT`, `DB_PATH`, `DEBUG_SQL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`, `REDIS_URL`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `DEFAULT_PAGE_SIZE`, `ADMIN_KEY`)

### Helper Script

```bash
sqlite3 storage/data.db < manual/inspect-queries.sql
```

This runs comprehensive queries to inspect row counts, column metadata, relationships, integrity checks, and statistics.

### Database Scripts

| Script        | Command                   | Description                                           |
|---------------|---------------------------|-------------------------------------------------------|
| `db:migrate`  | `npm run db:migrate`      | Creates the 7 tables (dotenv loaded by config.js)      |
| `db:seed`     | `npm run db:seed`         | Fetches seed data from [JSONPlaceholder](https://jsonplaceholder.typicode.com), auto-runs migrate + seed-settings |
| `db:seed-settings` | `npm run db:seed-settings` | Seeds environment variables into `settings` table (dotenv loaded by config.js) |
| `db:setup`    | `npm run db:setup`        | Runs `db:seed` + `db:seed-settings` (migrate + JSONPlaceholder + env settings) |
| `test`        | `npm test`                | Run vitest integration tests                          |
| `test:coverage` | `npm run test:coverage` | Run tests with V8 coverage report                    |

---

## Testing

Uses **vitest** with **V8 native coverage**. **250 tests across 14 test files** cover the full stack — from integration tests (real HTTP server + SQLite) to unit tests for every module.

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report (100% across all metrics)
```

See [tests/README.md](tests/README.md) for full documentation.

## License

[MIT](LICENSE) — Copyright (c) 2026 Dang Khoa &lt;i.am@dangkhoa.dev&gt;

## Credits

This project uses graphics from Flaticon:
* [Sustainability stickers](https://www.flaticon.com/free-stickers/sustainability) created by [Manuel Viveros - Flaticon](https://www.flaticon.com/authors/manuel-viveros?type=sticker)
