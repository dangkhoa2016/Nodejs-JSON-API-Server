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
    config.test.js                   # Config defaults and env var branches (8 tests)
    load-env.test.js                 # Load-env file loading chain and error paths (7 tests)
  db/
    database.test.js                 # Database CRUD, pagination, search, sort (5 tests)
    migrate.test.js                  # Migration success and failure paths (2 tests)
    seed.test.js                     # Seed with real DB + mocked deps, JSONPlaceholder fetch (5 tests)
    sql-logger.test.js               # SQL query logger wrapping tests (5 tests)
  middleware/
    rate-limiter.test.js             # In-memory and Redis rate limiter paths (6 tests)
  redis/
    redis.test.js                    # RESP protocol encoding/parsing, constructor options (25 tests)
  server/
    coverage-printlog.test.js        # V8 coverage: printLog, startServer, 500 catch (3 tests)
    integration.test.js              # API integration tests — real HTTP + SQLite (50 tests)
    server.test.js                   # Server request handler and startup paths (5 tests)
  helpers/
    coverage.js                      # Shared test utilities (save/restore/setEnv/clearCjs)
    index.js                         # startServer / stopServer / request utilities
    seed.js                          # Standalone script to create & seed temp DB
```

**Total: 121 tests across 11 test files.**

## Test design

### Integration tests (`tests/server/integration.test.js`)

Each run creates an isolated temp SQLite database, seeds it with test data via a child process (`helpers/seed.js`), then starts the server on port 3199. Tests make real HTTP requests and validate the full request lifecycle. Rate limiting is disabled via `RATE_LIMIT_ENABLED=false` in the test helper. The temp directory is cleaned up after all tests finish.

### Unit tests (`tests/config/`, `tests/db/`, `tests/middleware/`, `tests/redis/`, `tests/server/`)

Unit tests cover every source module individually. Each module has its own test file:

| Module                         | Test file                    | Approach |
|--------------------------------|------------------------------|----------|
| `config/index.js`              | `tests/config/config.test.js` | Module re-imported with different `process.env` values |
| `db/index.js`                  | `tests/db/database.test.js`   | Real `node:sqlite` databases with per-test temp files |
| `middleware/rate-limiter.js`   | `tests/middleware/rate-limiter.test.js` | Module imported once; `createRateLimiter()` with different configs per test |
| `redis/index.js`               | `tests/redis/redis.test.js`  | RESP encoding/parsing directly; constructor options |
| `server/index.js`              | `tests/server/server.test.js` | `requestHandler()` with mock req/res; CJS cache injection for DB mock |
| `server/index.js` (ESM)        | `tests/server/coverage-printlog.test.js` | Dynamic `import()` for V8-covered printLog, startServer, 500 catch |
| `db/migrate.js`                | `tests/db/migrate.test.js`   | Real migration + corrupt DB failure path |
| `db/seed.js`                   | `tests/db/seed.test.js`      | Dependency injection — `database` and `fetch` injected |
| `db/sql-logger.js`             | `tests/db/sql-logger.test.js`| Proxy wrapper behavior on exec/prepare/run/get/all |

### Key testing patterns

- **CJS cache injection**: Server tests inject mock `db/index.js` into the CJS `require.cache` before loading `server/index.js`, ensuring the mock is picked up by CommonJS `require()` calls.
- **Lazy config loading**: `middleware/rate-limiter.js` reads config inside `createRateLimiter()` rather than at module level, so tests can create limiters with different config values without re-importing the module.
- **Seed dependency injection**: `db/seed.js` accepts `database` and `fetch` parameters, bypassing the need to mock `require('https')` and `require('../db')`.
- **V8 coverage pragmas**: `/* v8 ignore */` comments exclude code paths that V8 cannot track through CJS module chains (e.g., CLI entry points, signal handlers, cross-worker coverage gaps).

## Configuration

`vitest.config.js` sets `NODE_ENV=test` and `PORT=3199`. Rate limiting is **not** disabled globally — it is only disabled in the integration test helper (`tests/helpers/index.js`). This allows unit tests to exercise the rate limiter with real config values.

## CI/CD

GitHub Actions (`.github/workflows/test.yml`) runs tests on Node.js 22, 23, and 26. Coverage is generated only on Node 26 and uploaded as an artifact.

## Coverage

```sh
npm run test:coverage
```

| Metric      | Coverage |
|-------------|----------|
| Statements  | ~98%    |
| Branches    | ~98%    |
| Functions   | ~96%    |
| Lines       | ~98%    |

All source files reach high coverage. The main low-coverage area is `seed.js` CLI paths (25% functions, 86.3% statements) — the `seedDatabase()` entry point and `process.on('uncaughtException')` handler run as child processes and escape V8 tracking.
