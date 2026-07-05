# Tài liệu kỹ thuật

> 🌐 Language / Ngôn ngữ: [English](TECHNICAL.md) | **Tiếng Việt**

> Kiến trúc, ghi chú triển khai và thiết kế nội bộ của json-api-server.

## Kiến trúc

```
json-api-server/
├── bin/
│   └── start.js                 # Điểm vào — tải .env qua src/config/load-env.js, khởi động server
├── src/
│   ├── config/
│   │   ├── index.js              # Cấu hình tập trung — tự động tải dotenv qua load-env.js, xuất camelCase
│   │   ├── load-env.js           # Trình tải dotenv dùng chung — tự động chạy khi require, bỏ qua trong production
│   │   ├── runtime-config.js     # Ghi đè cấu hình trong bộ nhớ an toàn luồng cho cập nhật runtime (rate-limit, Redis)
│   │   └── setting-defs.js       # Định nghĩa cài đặt cho 14 biến môi trường (NODE_ENV, PORT, ADMIN_KEY, v.v.)
│   ├── db/
│   │   ├── index.js              # Lớp SQLite (node:sqlite) — thao tác CRUD (đọc config)
│   │   ├── migrate.js            # Tạo bảng (chạy độc lập qua npm run db:migrate)
│   │   ├── seed.js               # Lấy dữ liệu mẫu từ JSONPlaceholder API, tự động chạy migrate
│   │   ├── seed-settings.js      # Seed 14 biến môi trường (NODE_ENV, PORT, ADMIN_KEY, v.v.) vào bảng settings
│   │   └── sql-logger.js         # Proxy wrapper dùng chung — ghi log exec/prepare/run/get/all ra stderr
│   ├── middleware/
│   │   └── rate-limiter.js       # Giới hạn tốc độ (Redis/in-memory, circuit breaker, escalating blocks)
│   ├── public/
│   │   ├── favicon.ico           # Favicon (định dạng ICO)
│   │   ├── favicon.png           # Favicon (định dạng PNG)
│   │   └── license.md            # File giấy phép Flaticon
│   ├── redis/
│   │   └── index.js              # Redis client thuần Node qua giao thức RESP trên TCP
│   └── server/
│       ├── index.js              # HTTP server, graceful shutdown, điều phối khởi động
│       └── route.js              # Phân tích route, handler request, xác thực admin, favicon, cập nhật cấu hình runtime
├── tests/
│   ├── config/
│   │   ├── config.test.js           # Config mặc định và nhánh biến môi trường (9)
│   │   └── load-env.test.js         # Tải chuỗi dotenv, override:false, bỏ qua production, fallback (7)
│   ├── db/
│   │   ├── database.test.js         # CRUD database, phân trang, tìm kiếm, sắp xếp, SQL injection, cascade delete (11)
│   │   ├── migrate.test.js          # Đường dẫn migration thành công và thất bại (2)
│   │   ├── seed.test.js             # Seed với DB thật + mock dependencies, JSONPlaceholder fetch (5)
│   │   └── sql-logger.test.js       # Bọc SQL query logger (5)
│   ├── middleware/
│   │   └── rate-limiter.test.js     # In-memory, Redis, circuit breaker, proxy IPs, updateConfig (57)
│   ├── redis/
│   │   └── redis.test.js            # Mã hóa/giải mã giao thức RESP, tùy chọn constructor, eval, reconnect (33)
│   ├── server/
│   │   ├── coverage-printlog.test.js # Printlog và V8 coverage xuất server (4)
│   │   ├── graceful-shutdown.test.js # Vùng phủ handler SIGINT/SIGTERM (1)
│   │   ├── index.test.js            # Handler request server, admin auth, tắt máy an toàn (13)
│   │   ├── integration.test.js      # Kiểm thử tích hợp API — HTTP thật + SQLite, runtime PATCH (81)
│   │   └── route.test.js            # Phân tích route, favicon, health, cache xác thực admin, runtime config (18)
│   ├── README.md                    # Tài liệu kiểm thử (tiếng Anh)
│   ├── README.vi.md                 # Tài liệu kiểm thử (tiếng Việt)
│   └── helpers/
│       ├── coverage.js              # Tiện ích vùng phủ kiểm thử (save/restore/setEnv/clearCjs/configMockFactory)
│       ├── index.js                 # Tiện ích startServer / stopServer / request
│       ├── mock-factory.js          # Hàm factory mock (mkDb/mkReq/mkRes/mkRedis/mkSettingsTable)
│       └── seed.js                  # Script độc lập để tạo và seed DB tạm thời
│   └── seed-settings-coverage.test.js  # Vùng phủ V8 seed-settings.js — DB thật + mock DB paths (4)
├── manual/
│   ├── admin.sh                 # Lệnh curl admin panel
│   ├── albums.sh                # Endpoint albums
│   ├── comments.sh              # Endpoint comments
│   ├── curl.sh                  # Lệnh curl nhanh
│   ├── health.sh                # Endpoint health
│   ├── inspect-queries.sql      # Truy vấn SQL để kiểm tra database
│   ├── inspect.sh               # Script kiểm tra database
│   ├── inspect-docker-data.sh   # Script kiểm tra dữ liệu Docker
│   ├── photos.sh                # Endpoint photos
│   ├── posts.sh                 # Endpoint posts
│   ├── todos.sh                 # Endpoint todos
│   └── users.sh                 # Endpoint users
├── manual-test-coverage/
│   ├── README.md                    # Tài liệu kiểm tra vùng phủ
│   └── verify-commit-coverage.sh    # Script kiểm tra vùng phủ
├── Dockerfile                   # Định nghĩa image Docker
├── docker-entrypoint.sh         # Script entrypoint container
├── .dockerignore                # Quy tắc ignore Docker
├── storage/                     # File SQLite database (tự động tạo)
├── temp/                        # File tạm thời (đã gitignore)
├── .env                         # Cấu hình cơ bản (được thử đầu tiên trong development — ưu tiên cao nhất)
├── .env.dev                     # Fallback development (được thử nếu không tìm thấy .env)
├── .env.test                    # Cấu hình test (cổng 3001, DB riêng, không giới hạn tốc độ)
├── .env.prod.example            # Mẫu production (copy thành .env.prod)
├── .env.example                 # Tham chiếu cho tất cả biến có sẵn
├── package.json                 # Metadata và scripts
├── LICENSE                      # Giấy phép MIT
├── README.md                    # Tài liệu (tiếng Anh)
├── README.vi.md                 # Tài liệu (tiếng Việt)
├── .gitignore                   # Quy tắc ignore Git
└── vitest.config.js             # Cấu hình trình chạy kiểm thử Vitest
```

### Luồng khởi động

```
bin/start.js → src/config/load-env.js (tải .env theo NODE_ENV, bỏ qua trong production)
  → src/server/index.js
      ├── src/config/index.js     (cấu hình tập trung, tự động tải dotenv)
      ├── src/db/index.js         (SQLite CRUD)
      ├── src/redis/index.js      (RESP thuần + AUTH + URL)
      └── src/middleware/rate-limiter.js (Redis || in-memory, circuit breaker, escalating blocks)

# Script độc lập: npm run db:migrate / npm run db:seed / npm run db:setup (config tải dotenv tự động)
```

### Luồng request

```
HTTP Request → CORS headers → Rate limiter → Phân tích route → Handler → JSON Response
```

---

## Ghi chú triển khai

- **Runtime dependencies tối thiểu** — chỉ có `argon2` để băm mật khẩu admin; mọi thứ khác đều dùng module built-in của Node.js (`http`, `url`, `fs`, `path`, `net`, `node:sqlite`). `dotenv` là dev dependency.
- **Giao thức RESP thuần** — Redis client trong `src/redis/index.js` triển khai giao thức tuần tự hóa Redis qua TCP sockets mà không cần thư viện bên thứ ba. Hỗ trợ xác thực mật khẩu `AUTH` và chuỗi kết nối `REDIS_URL`.
- **Cấu hình tập trung** — tất cả biến môi trường được đọc trong `src/config/index.js` và xuất dưới dạng camelCase (`port`, `dbPath`, `redisOpts`, `rateLimitMax`, `dbDebugSql`, v.v.) để sử dụng trên toàn bộ codebase.
- **Rate limiter** — `src/middleware/rate-limiter.js` có circuit breaker cho Redis lỗi, trích xuất IP proxy đáng tin cậy dựa trên CIDR, thời gian chặn tăng dần (5 ph → 20 ph → 1 giờ), Lua script Redis nguyên tử, và fallback in-memory với LRU eviction. `createRateLimiter()` nhận tùy chọn trực tiếp thay vì đọc config lazily.
- **Cấu hình runtime** — Patching cài đặt rate-limit hoặc Redis qua admin API áp dụng thay đổi ngay lập tức thông qua `RuntimeConfig` (ghi đè trong bộ nhớ), tránh khởi động lại server. Hot-swap rate-limit dùng `rateLimiter.updateConfig()`; kết nối lại Redis dùng `Redis.reconnect()`.
- **Script seed có thể kiểm thử** — `src/db/seed.js` chấp nhận tham số `database` và `fetch` qua dependency injection, cho phép kiểm thử đơn vị đầy đủ mà không cần mock `require()`.
- **Ghi log SQL** — `src/db/sql-logger.js` xuất các wrapper Proxy `wrapDb`/`wrapStmt` ghi log các lệnh gọi `exec`, `prepare`, `run`, `get`, và `all` ra stderr. `src/db/index.js` sử dụng chúng qua `getWrappedDb()` khi `DEBUG_SQL=true`.
- **Đa môi trường** — `src/config/index.js` require `src/config/load-env.js` ở cấp module, module này tải theo chuỗi tất cả file dotenv với `override: false` — giá trị `process.env` hiện có và file trước có quyền cao hơn file sau. Mọi consumer (server, migrate, seed) chỉ cần require `src/config/index.js` và nhận giá trị env chính xác. Trong production, dotenv bị bỏ qua hoàn toàn — biến env phải đến từ môi trường triển khai.
- **Ngăn chặn SQL injection** — `src/db/index.js` xác thực `_sort` với danh sách trắng các cột đã biết và đặt tên cột trong `""`; ký tự đại diện LIKE (`%`, `_`) được thoát để ngăn chặn injection qua tham số `q`
- **Cache xác thực Argon2** — `src/server/route.js` lưu cache kết quả xác minh `ADMIN_KEY` trong `Map` với TTL 5 giây và giới hạn 1.000 mục, tránh băm argon2 lặp lại trên các request admin burst
- **CORS** được bật trên tất cả các route
- **Tắt máy an toàn** — xử lý `SIGINT` và `SIGTERM` để đóng server và kết nối Redis sạch sẽ
