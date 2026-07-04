# Kiểm thử

> 🌐 Language / Ngôn ngữ: [English](README.md) | **Tiếng Việt**

## Stack

- **vitest** — trình chạy kiểm thử
- **@vitest/coverage-v8** — vùng phủ mã V8 gốc

## Lệnh

```sh
npm test                 # Chạy tất cả kiểm thử một lần
npm run test:watch       # Chế độ watch
npm run test:coverage    # Chạy với báo cáo vùng phủ
```

## Cấu trúc

```
tests/
  config/
    config.test.js                   # Config mặc định và nhánh biến môi trường (9 kiểm thử)
    load-env.test.js                 # Tải chuỗi, override:false, bỏ qua production, fallback (7 kiểm thử)
  db/
    database.test.js                 # CRUD database, phân trang, tìm kiếm, sắp xếp, SQL injection, cascade delete (11 kiểm thử)
    migrate.test.js                  # Đường dẫn migration thành công và thất bại (2 kiểm thử)
    seed.test.js                     # Seed với DB thật + mock dependencies, JSONPlaceholder fetch (5 kiểm thử)
    sql-logger.test.js               # Kiểm thử bọc SQL query logger (5 kiểm thử)
  middleware/
    rate-limiter.test.js             # Đường dẫn rate limiter in-memory và Redis, circuit breaker, proxy IPs, hot-swap updateConfig (57 kiểm thử)
  redis/
    redis.test.js                    # Mã hóa/giải mã giao thức RESP, tùy chọn constructor, phương thức eval, reconnect (33 kiểm thử)
  server/
    coverage-printlog.test.js        # Vùng phủ V8 printlog và xuất server (4 kiểm thử)
    graceful-shutdown.test.js        # Vùng phủ handler SIGINT/SIGTERM (1 kiểm thử)
    index.test.js                    # Handler request server, admin auth, tắt máy an toàn (13 kiểm thử)
    integration.test.js              # Kiểm thử tích hợp API — HTTP thật + SQLite, PATCH settings runtime (81 kiểm thử)
    route.test.js                    # Phân tích route, favicon, health, cache xác thực admin, cập nhật cấu hình runtime (18 kiểm thử)
  README.md                          # Tài liệu kiểm thử (tiếng Anh)
  README.vi.md                       # Tài liệu kiểm thử (tiếng Việt)
  helpers/
    coverage.js                      # Tiện ích kiểm thử dùng chung (save/restore/setEnv/clearCjs/configMockFactory)
    mock-factory.js                  # Hàm factory mock (mkDb/mkReq/mkRes/mkRedis/mkSettingsTable)
    index.js                         # Tiện ích startServer / stopServer / request
    seed.js                          # Script độc lập để tạo và seed DB tạm thời
  seed-settings-coverage.test.js     # Vùng phủ V8 seed-settings.js (4 kiểm thử)
```

**Tổng: 250 kiểm thử trên 14 file.**

## Thiết kế kiểm thử

### Kiểm thử tích hợp (`tests/server/integration.test.js`)

Mỗi lần chạy tạo một database SQLite tạm thời riêng biệt, seed dữ liệu kiểm thử qua một tiến trình con (`helpers/seed.js`), sau đó khởi động server trên cổng 3199. Kiểm thử thực hiện request HTTP thật và xác thực toàn bộ vòng đời request — bao gồm phân trang (`_page`/`_limit`/`_start`/`_end`), tìm kiếm (`q`), sắp xếp (`_sort`/`_order`), và thao tác CRUD. Giới hạn tốc độ bị tắt qua `RATE_LIMIT_ENABLED=false` trong helper kiểm thử. Thư mục tạm được dọn dẹp sau khi tất cả kiểm thử hoàn tất.

### Kiểm thử đơn vị (`tests/config/`, `tests/db/`, `tests/middleware/`, `tests/redis/`, `tests/server/`)

Kiểm thử đơn vị bao phủ từng module nguồn riêng lẻ. Mỗi module có file kiểm thử riêng:

| Module                         | File kiểm thử                | Cách tiếp cận |
|--------------------------------|------------------------------|----------|
| `config/index.js`              | `tests/config/config.test.js` | Module được import lại với các giá trị `process.env` khác nhau |
| `config/runtime-config.js`     | _(được bao phủ qua route.test.js & integration.test.js)_ | Ghi đè cấu hình trong bộ nhớ cho cập nhật runtime |
| `config/load-env.js`           | `tests/config/load-env.test.js` | Thư mục env tạm thời, mock dotenv; kiểm thử chain, override:false, ENOENT, lỗi phân tích |
| `db/index.js`                  | `tests/db/database.test.js`   | Database `node:sqlite` thật; kiểm thử phân trang, tìm kiếm, sắp xếp, SQL injection |
| `middleware/rate-limiter.js`   | `tests/middleware/rate-limiter.test.js` | Module được import một lần; mock Redis, in-memory store; kiểm thử circuit breaker, proxy IPs, escalating blocks |
| `redis/index.js`               | `tests/redis/redis.test.js`  | Mã hóa/giải mã RESP trực tiếp; tùy chọn constructor |
| `server/index.js`              | `tests/server/index.test.js`  | `requestHandler()` với mock req/res; inject CJS cache cho mock DB; kiểm thử auth caching và tắt máy an toàn (13 kiểm thử) |
| `server/route.js`              | `tests/server/route.test.js`  | Phân tích route, favicon, null body, health endpoint, xác thực admin, cache auth, reset-database, route không xác định, cập nhật cấu hình runtime (rate-limit + Redis) |
| `server/index.js` (ESM)        | `tests/server/coverage-printlog.test.js` | `import()` động cho printLog, startServer, catch 500 được vùng phủ V8 |
| `server/index.js` (tiến trình con)| `tests/server/graceful-shutdown.test.js` | SIGINT/SIGTERM qua tiến trình con (vùng phủ V8) |
| `db/migrate.js`                | `tests/db/migrate.test.js`   | Migration thật + đường dẫn thất bại do DB hỏng |
| `db/seed.js`                   | `tests/db/seed.test.js`      | Dependency injection — `database` và `fetch` được inject |
| `db/seed-settings.js`          | `tests/seed-settings-coverage.test.js` | DB thật + đường dẫn mock DB (vùng phủ V8) |
| `db/sql-logger.js`             | `tests/db/sql-logger.test.js`| Hành vi Proxy wrapper trên exec/prepare/run/get/all |

### Mẫu kiểm thử chính

- **Inject CJS cache**: Kiểm thử server inject mock `db/index.js` vào `require.cache` của CJS trước khi tải `server/index.js`, đảm bảo mock được `require()` của CommonJS sử dụng.
- **Kiểm thử rate limiter**: `middleware/rate-limiter.js` nhận tùy chọn qua `createRateLimiter({enabled, max, windowMs})`, giúp dễ dàng kiểm thử với các cấu hình khác nhau, mock Redis, và mô phỏng trạng thái circuit breaker mà không cần import lại. Kiểm thử bao gồm fallback in-memory, chế độ Redis, trích xuất IP proxy CIDR, và thời gian chặn tăng dần.
- **Dependency injection cho seed**: `db/seed.js` chấp nhận tham số `database` và `fetch`, tránh phải mock `require('https')` và `require('../db')`.
- **Kiểm thử cấu hình runtime**: Cập nhật cấu hình runtime được kiểm thử qua cả kiểm thử đơn vị (`route.test.js` với CJS cache injection) và kiểm thử tích hợp (`integration.test.js` với request HTTP thật). Phương thức `updateConfig()` trên middleware rate limiter được kiểm thử trực tiếp trong `rate-limiter.test.js`, trong khi kết nối lại Redis được kiểm thử trong `redis.test.js` với TCP server thật.
- **Chỉ thị vùng phủ V8**: Comment `/* v8 ignore */` loại trừ các đường dẫn mã mà V8 không thể theo dõi qua chuỗi module CJS (ví dụ: điểm vào CLI, handler tín hiệu, khoảng trống vùng phủ cross-worker).

## Cấu hình

`vitest.config.js` đặt `NODE_ENV=test` và `PORT=3199`. Giới hạn tốc độ bị tắt trong helper kiểm thử tích hợp (`tests/helpers/index.js`) nhưng được bật mặc định trong kiểm thử đơn vị, cho phép thực thi đầy đủ rate limiter bao gồm circuit breaker và escalating blocks.

## CI/CD

GitHub Actions (`.github/workflows/test.yml`) chạy kiểm thử trên Node.js 22, 23, và 26. Vùng phủ chỉ được tạo trên Node 26 và được tải lên dưới dạng artifact.

## Vùng phủ

```sh
npm run test:coverage
```

| Chỉ số      | Vùng phủ |
|-------------|----------|
| Statements  | 100%    |
| Branches    | 100%    |
| Functions   | 100%    |
| Lines       | 100%    |

Tất cả file nguồn đạt 100% vùng phủ V8 trên mọi chỉ số.
