# Testing

## Stack

- **vitest** — test runner
- **@vitest/coverage-v8** — V8 native code coverage

## Commands

```sh
npm test                 # Run all tests once
npm run test:watch       # Watch mode
npm run test:coverage    # Run with coverage report
```

## Structure

```
tests/
  config/
    config.test.js                   # Config defaults and env var branches (9 tests)
    load-env.test.js                 # Chain-loading, override:false, production skip, fallback (7 tests)
  db/
    database.test.js                 # Database CRUD, pagination, search, sort, SQL injection, cascade delete (11 tests)
    migrate.test.js                  # Migration success and failure paths (2 tests)
    seed.test.js                     # Seed with real DB + mocked deps, JSONPlaceholder fetch (5 tests)
    sql-logger.test.js               # SQL query logger wrapping tests (5 tests)
  middleware/
    rate-limiter.test.js             # In-memory, Redis, circuit breaker, proxy IPs (54 tests)
  redis/
    redis.test.js                    # RESP protocol encoding/parsing, constructor options, eval method (27 tests)
  server/
    coverage-printlog.test.js        # Printlog and server export V8 coverage (4 tests)
    graceful-shutdown.test.js        # SIGINT/SIGTERM handler coverage (1 test)
    integration.test.js              # API integration tests — real HTTP + SQLite (77 tests)
    index.test.js                    # Server request handler, admin auth, graceful shutdown (13 tests)
    route.test.js                    # Route parsing, favicon, health, admin auth cache (14 tests)
  helpers/
    coverage.js                      # Shared test utilities (save/restore/setEnv/clearCjs/configMockFactory)
    mock-factory.js                  # Mock factory helpers (mkDb/mkReq/mkRes/mkRedis/mkSettingsTable)
    index.js                         # startServer / stopServer / request utilities
    seed.js                          # Standalone script to create & seed temp DB
    seed-settings-coverage.test.js   # Seed-settings.js V8 coverage (4 tests)
```

**Total: 233 tests across 14 test files.**

## Test design

### Integration tests (`tests/server/integration.test.js`)

Each run creates an isolated temp SQLite database, seeds it with test data via a child process (`helpers/seed.js`), then starts the server on port 3199. Tests make real HTTP requests and validate the full request lifecycle — including pagination (`_page`/`_limit`/`_start`/`_end`), search (`q`), sorting (`_sort`/`_order`), and CRUD operations. Rate limiting is disabled via `RATE_LIMIT_ENABLED=false` in the test helper. The temp directory is cleaned up after all tests finish.

### Unit tests (`tests/config/`, `tests/db/`, `tests/middleware/`, `tests/redis/`, `tests/server/`)

Unit tests cover every source module individually. Each module has its own test file:

| Module                         | Test file                    | Approach |
|--------------------------------|------------------------------|----------|
| `config/index.js`              | `tests/config/config.test.js` | Module re-imported with different `process.env` values |
| `config/load-env.js`           | `tests/config/load-env.test.js` | Temp env dirs, mocked dotenv; tests chain, override:false, ENOENT, parse errors |
| `db/index.js`                  | `tests/db/database.test.js`   | Real `node:sqlite` databases; tests pagination, search, sort, SQL injection |
| `middleware/rate-limiter.js`   | `tests/middleware/rate-limiter.test.js` | Module imported once; mocks Redis, in-memory store; tests circuit breaker, proxy IPs, escalating blocks |
| `redis/index.js`               | `tests/redis/redis.test.js`  | RESP encoding/parsing directly; constructor options |
| `server/index.js`              | `tests/server/index.test.js`  | `requestHandler()` with mock req/res; CJS cache injection for DB mock; tests auth caching and graceful shutdown (13 tests) |
| `server/route.js`              | `tests/server/route.test.js`  | Route parsing, favicon, null body, health endpoint, admin auth, auth cache eviction, reset-database, unknown routes |
| `server/index.js` (ESM)        | `tests/server/coverage-printlog.test.js` | Dynamic `import()` for V8-covered printLog, startServer, 500 catch |
| `server/index.js` (child)      | `tests/server/graceful-shutdown.test.js` | SIGINT/SIGTERM via child process (V8 coverage) |
| `db/migrate.js`                | `tests/db/migrate.test.js`   | Real migration + corrupt DB failure path |
| `db/seed.js`                   | `tests/db/seed.test.js`      | Dependency injection — `database` and `fetch` injected |
| `db/seed-settings.js`          | `tests/seed-settings-coverage.test.js` | Real DB + mock DB paths (V8 coverage) |
| `db/sql-logger.js`             | `tests/db/sql-logger.test.js`| Proxy wrapper behavior on exec/prepare/run/get/all |

### Key testing patterns

- **CJS cache injection**: Server tests inject mock `db/index.js` into the CJS `require.cache` before loading `server/index.js`, ensuring the mock is picked up by CommonJS `require()` calls.
- **Rate limiter testing**: `middleware/rate-limiter.js` accepts options via `createRateLimiter({enabled, max, windowMs})`, making it easy to test with different configurations, mock Redis, and simulate circuit breaker states without re-importing. Tests cover in-memory fallback, Redis mode, CIDR proxy IP extraction, and escalating block durations.
- **Seed dependency injection**: `db/seed.js` accepts `database` and `fetch` parameters, bypassing the need to mock `require('https')` and `require('../db')`.
- **V8 coverage pragmas**: `/* v8 ignore */` comments exclude code paths that V8 cannot track through CJS module chains (e.g., CLI entry points, signal handlers, cross-worker coverage gaps).

## Configuration

`vitest.config.js` sets `NODE_ENV=test` and `PORT=3199`. Rate limiting is disabled in the integration test helper (`tests/helpers/index.js`) but enabled by default in unit tests, which exercise the full rate limiter including circuit breaker and escalating blocks.

## CI/CD

GitHub Actions (`.github/workflows/test.yml`) runs tests on Node.js 22, 23, and 26. Coverage is generated only on Node 26 and uploaded as an artifact.

## Coverage

```sh
npm run test:coverage
```

| Metric      | Coverage |
|-------------|----------|
| Statements  | 100%    |
| Branches    | 100%    |
| Functions   | 100%    |
| Lines       | 100%    |

All source files reach 100% V8 coverage across all metrics.
