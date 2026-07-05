# json-api-server

> 🌐 Language / Ngôn ngữ: [English](README.md) | **Tiếng Việt**

Một REST API tương thích JSONPlaceholder, được xây dựng chủ yếu bằng **Node.js built-ins** — dependency runtime duy nhất là `argon2` dùng để băm mật khẩu admin. Dùng `node:sqlite` để lưu trữ và một Redis client tự xây dựng trên giao thức RESP qua TCP sockets.

## Công nghệ sử dụng

- **Node.js >= 22** — runtime với `node:sqlite`, `node:http`, `node:net` tích hợp sẵn
- **node:sqlite** — cơ sở dữ liệu SQLite (tích hợp sẵn)
- **node:http** — HTTP server (tích hợp sẵn, không dùng Express/Fastify)
- **node:net** — TCP sockets cho Redis client RESP tự xây dựng (tích hợp sẵn)
- **argon2** — băm mật khẩu an toàn cho xác thực admin (dependency runtime duy nhất)
- **RESP protocol** — Redis client tự xây dựng, triển khai Redis Serialization Protocol qua TCP
- **dotenv** — tải file môi trường (chỉ là dev dependency, bỏ qua trong production)
- **vitest** — trình chạy kiểm thử với vùng phủ V8 gốc (dev dependency)

## Yêu cầu

- **Node.js >= 22** (dùng `node:sqlite` tích hợp sẵn)
- **Redis** (không bắt buộc — giới hạn tốc độ fallback về in-memory nếu không có)

## Bắt đầu nhanh

```bash
git clone <repo-url>
cd json-api-server

npm run db:setup   # tạo bảng + dữ liệu mẫu (cần chạy trước lần đầu)
npm start          # khởi động server
# hoặc với file watching cho phát triển:
npm run dev
```

## Docker

### Build

```bash
docker build -t json-api-server .
```

### Chạy

```bash
docker run -d -p 3000:3000 -v ./storage:/app/storage --name json-api-server json-api-server
```

Entrypoint tự động chạy `npm run db:setup` (migrate + seed) khi container khởi động.

### Biến môi trường

```bash
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e ADMIN_KEY=my-secret-key \
  -e REDIS_HOST=redis \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

### Ghi chú

- Container chạy với user `app` (không phải root).
- File database được lưu trong `/app/storage` (khai báo là `VOLUME`).
- `NODE_ENV=production` được đặt mặc định — dotenv **bị bỏ qua**, do đó mọi cấu hình phải được truyền qua biến môi trường (xem bên dưới).
- File `.env` và `.env.*` bị loại trừ bởi `.dockerignore` và **không được copy** vào image.
- Entrypoint chạy `npm run db:setup` khi container khởi động.

### Cấu hình môi trường

Container chạy với `NODE_ENV=production`, khi đó `src/config/load-env.js` **bỏ qua hoàn toàn dotenv**. Kết hợp với `.dockerignore` loại trừ mọi file `.env*`, bạn **bắt buộc** phải truyền cấu hình qua biến môi trường Docker.

**Khuyến nghị**: truyền biến trực tiếp:

```bash
docker run -d -p 3000:3000 \
  -e PORT=3000 \
  -e ADMIN_KEY=my-secret-key \
  -e REDIS_HOST=redis \
  -e SEED_API_BASE_URL=https://jsonplaceholder.typicode.com \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

**Cách khác — mount file env** (chỉ hoạt động với `NODE_ENV=production-local`):

```bash
docker run -d -p 3000:3000 \
  -e NODE_ENV=production-local \
  -v ./.env.prod:/app/.env.prod \
  -v ./storage:/app/storage \
  --name json-api-server json-api-server
```

> **Lưu ý:** Node 22 có thể hiển thị cảnh báo rằng `node:sqlite` đang ở giai đoạn thử nghiệm. Điều này vô hại.

---

## Cấu hình

File môi trường được tải bởi `src/config/load-env.js` (tự động chạy qua `src/config/index.js`). Tất cả file hiện có trong chuỗi đều được tải với `override: false` — giá trị `process.env` và file trước có quyền cao hơn file sau. Biến môi trường hệ thống luôn có quyền cao nhất (ví dụ: `PORT=5000 npm start`).

`NODE_ENV` mặc định là `development` nếu không được đặt. Trong môi trường **production**, `dotenv` **hoàn toàn bị bỏ qua** — hãy đặt biến môi trường thông qua môi trường triển khai của bạn (systemd, Docker, Kubernetes, v.v.).

| NODE_ENV            | dotenv | Chuỗi fallback (thử theo thứ tự) |
|---------------------|--------|-----------------------------------|
| `development`       | ✅     | `.env` ← `.env.dev` ← `.env.development` |
| `production-local`  | ✅     | `.env.prod` ← `.env.production` |
| `test`              | ✅     | `.env.test` |
| `production`        | ❌ bỏ qua | _(dùng biến môi trường hệ thống)_ |

### Biến

| Biến                   | Mặc định    | Mô tả                            |
|------------------------|-------------|----------------------------------------|
| `PORT`                 | `3000`      | Cổng server                            |
| `DB_PATH`              | `./storage/data.db` | Đường dẫn file SQLite           |
| `REDIS_URL`            | _(không)_   | URL kết nối Redis (ưu tiên cao hơn). Định dạng: `redis://user:password@host:port/db` |
| `REDIS_HOST`           | `127.0.0.1` | Redis host                             |
| `REDIS_PORT`           | `6379`      | Redis port                             |
| `REDIS_DB`             | `0`         | Chỉ mục database Redis                 |
| `REDIS_PASSWORD`       | _(không)_   | Mật khẩu Redis (cho `AUTH`)            |
| `RATE_LIMIT_ENABLED`   | `true`      | Bật/tắt giới hạn tốc độ                |
| `RATE_LIMIT_MAX`       | `100`       | Số request tối đa trong một khoảng thời gian |
| `DEBUG_SQL`            | `false`     | Ghi log tất cả truy vấn SQL ra stderr (`true`/`false`) |
| `RATE_LIMIT_WINDOW_MS` | `60000`     | Khoảng thời gian tính bằng mili giây (mặc định 1 phút) |
| `SEED_API_BASE_URL`    | `https://jsonplaceholder.typicode.com` | URL gốc cho API dữ liệu mẫu |
| `MAX_BODY_SIZE`        | `1048576`   | Kích thước body request tối đa tính bằng byte (tối thiểu 1) |
| `DEFAULT_PAGE_SIZE`   | `10`        | Số kết quả mặc định mỗi trang cho phân trang `_page`/`_limit` |
| `ADMIN_KEY`           | _(không)_   | Khóa chính để xác thực request admin API (Bearer token) |
| **Cập nhật runtime** | —           | Patching `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, hoặc `REDIS_PASSWORD` qua admin API áp dụng thay đổi ngay lập tức — không cần khởi động lại server |

---

## API Endpoints

### Tài nguyên

| Method   | Path                        | Mô tả                  |
|----------|-----------------------------|------------------------------|
| `GET`    | `/api/users`                | Danh sách tất cả user        |
| `GET`    | `/api/users/:id`            | Lấy user theo ID             |
| `GET`    | `/api/users/:id/posts`      | Bài viết của user            |
| `GET`    | `/api/users/:id/albums`     | Album của user               |
| `GET`    | `/api/users/:id/todos`      | Việc cần làm của user        |
| `GET`    | `/api/posts`                | Danh sách tất cả bài viết    |
| `GET`    | `/api/posts/:id`            | Lấy bài viết theo ID         |
| `GET`    | `/api/posts/:id/comments`   | Bình luận của bài viết       |
| `GET`    | `/api/comments`             | Danh sách tất cả bình luận   |
| `GET`    | `/api/albums`               | Danh sách tất cả album       |
| `GET`    | `/api/albums/:id/photos`    | Ảnh trong album              |
| `GET`    | `/api/photos`               | Danh sách tất cả ảnh         |
| `GET`    | `/api/todos`                | Danh sách tất cả việc cần làm|
| `POST`   | `/api/:table`               | Tạo tài nguyên mới           |
| `PUT`    | `/api/:table/:id`           | Thay thế toàn bộ tài nguyên  |
| `PATCH`  | `/api/:table/:id`           | Cập nhật một phần            |
| `DELETE` | `/api/:table/:id`           | Xóa tài nguyên               |

> **Xóa tầng (cascade)**: Xóa `user` sẽ xóa `posts`, `albums`, và `todos` của họ. Xóa `post` sẽ xóa `comments` của nó. Xóa `album` sẽ xóa `photos` của nó.

### Lọc theo query string và phân trang

```bash
# Lọc bài viết theo userId
GET /api/posts?userId=1

# Lọc việc cần làm theo userId và trạng thái hoàn thành
GET /api/todos?userId=1&completed=false

# Lọc bình luận theo postId
GET /api/comments?postId=1
```

Các cột có thể lọc khác nhau theo bảng (ví dụ: `title`, `email`, `username`). Trường `completed` chấp nhận chuỗi `true`/`false`.

### Phân trang

| Tham số    | Mô tả                                    | Ví dụ                      |
|-----------|------------------------------------------------|------------------------------|
| `_page`   | Số trang (bắt đầu từ 1), dùng với `_limit`     | `?_page=1&_limit=10`        |
| `_limit`  | Số mục mỗi trang (mặc định: `DEFAULT_PAGE_SIZE`)| `?_page=2&_limit=5`         |
| `_start`  | Chỉ số bắt đầu để cắt                         | `?_start=10&_end=20`        |
| `_end`    | Chỉ số kết thúc (không bao gồm) để cắt         | `?_start=0&_end=5`          |

### Tìm kiếm

Tìm kiếm trên các cột văn bản bằng tham số `q`. Các cột có thể tìm kiếm khác nhau theo bảng:

| Bảng       | Cột có thể tìm kiếm                    |
|------------|-------------------------------------------|
| `users`    | `name`, `username`, `email`               |
| `posts`    | `title`, `body`                           |
| `comments` | `name`, `email`, `body`                   |
| `albums`   | `title`                                   |
| `photos`   | `title`                                   |
| `todos`    | `title`                                   |

```bash
# Tìm bài viết theo tiêu đề hoặc nội dung
GET /api/posts?q=first

# Kết hợp tìm kiếm với bộ lọc
GET /api/posts?q=Post&userId=1

# Tìm việc cần làm
GET /api/todos?q=groceries
```

### Sắp xếp

| Tham số    | Giá trị         | Mô tả                          |
|----------|----------------|--------------------------------------|
| `_sort`  | tên cột        | Cột để sắp xếp                       |
| `_order` | `asc` / `desc` | Hướng sắp xếp (mặc định: `asc`)      |

```bash
# Sắp xếp bài viết theo tiêu đề tăng dần
GET /api/posts?_sort=title&_order=asc

# Sắp xếp bài viết theo tiêu đề giảm dần
GET /api/posts?_sort=title&_order=desc

# Kết hợp sắp xếp với phân trang
GET /api/posts?_sort=id&_order=desc&_limit=2
```

### Endpoint hệ thống

| Path                              | Mô tả                          |
|-----------------------------------|--------------------------------------|
| `GET /`                           | Thông tin API với các endpoint có sẵn|
| `GET /api`                        | Thông tin API (giống như trên)       |
| `GET /health`                     | Trạng thái server (Redis, bảng, cấu hình giới hạn tốc độ) |
| `GET /api/health`                 | Giống như trên                       |
| `GET /api/admin/settings`         | Danh sách tất cả cài đặt (yêu cầu xác thực) |
| `PATCH /api/admin/settings/:key`  | Cập nhật giá trị cài đặt — thay đổi rate-limit & Redis có **hiệu lực ngay lập tức** (yêu cầu xác thực) |
| `POST /api/admin/reset-database`  | Xóa bảng dữ liệu và seed lại từ JSONPlaceholder (yêu cầu xác thực) |

### Admin API

Các endpoint admin được bảo vệ bằng xác thực Bearer token sử dụng biến môi trường `ADMIN_KEY`. Giá trị cài đặt được lưu trong bảng `settings` của database.

```bash
# Danh sách tất cả cài đặt
curl http://localhost:3000/api/admin/settings \
  -H "Authorization: Bearer my-secret-key"

# Cập nhật cài đặt
curl -X PATCH http://localhost:3000/api/admin/settings/NODE_ENV \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"value": "production"}'

# Đặt lại database (xóa toàn bộ dữ liệu và tải lại từ JSONPlaceholder)
curl -X POST http://localhost:3000/api/admin/reset-database \
  -H "Authorization: Bearer my-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

`ADMIN_KEY` được băm bằng **argon2** trước khi lưu trữ. Khi cập nhật mật khẩu qua `PATCH /api/admin/settings/ADMIN_KEY`, giá trị mới tự động được băm. Mật khẩu không bao giờ được lưu dưới dạng văn bản thuần túy.

**Cập nhật cấu hình runtime**: Khi patching cài đặt rate-limit (`RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`) hoặc cài đặt kết nối Redis (`REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`, `REDIS_URL`), server áp dụng thay đổi ngay lập tức qua lớp `RuntimeConfig` — không cần khởi động lại. Thay đổi rate-limit gọi `rateLimiter.updateConfig()` để hot-swap hành vi middleware, trong khi cài đặt Redis kích hoạt kết nối lại an toàn qua `Redis.reconnect()`.

Kết quả xác minh Argon2 được **lưu cache trong bộ nhớ 5 giây** cho mỗi token, tránh băm lặp lại trên các request admin liên tiếp. Khi có lỗi, kết quả cũng được lưu cache là không hợp lệ — ngăn chặn rò rỉ thông tin qua timing hoặc thông báo lỗi.

---

## Response Headers

Mọi response đều bao gồm header CORS và giới hạn tốc độ:

```
Access-Control-Allow-Origin: *
X-Powered-By: json-api-server/1.0
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 99
X-RateLimit-Reset:     58      ← giây cho đến khi cửa sổ reset
X-RateLimit-Store:     redis   ← "redis" hoặc "memory"
```

Khi vượt quá giới hạn tốc độ, response `429 Too Many Requests` được trả về:

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

## Ví dụ

```bash
# Danh sách user
curl http://localhost:3000/api/users

# Tạo bài viết mới
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "title": "Hello", "body": "World"}'

# Cập nhật một phần
curl -X PATCH http://localhost:3000/api/posts/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title"}'

# Xóa
curl -X DELETE http://localhost:3000/api/posts/1

# Kiểm tra sức khỏe
curl http://localhost:3000/health
```

Xem [docs/TECHNICAL.vi.md](docs/TECHNICAL.vi.md) để biết kiến trúc và ghi chú triển khai chi tiết.

## Database

- **7 bảng:** `users`, `posts`, `comments`, `albums`, `photos`, `todos`, `settings`
- **Chế độ WAL** cho hiệu suất đọc đồng thời tốt hơn
- **Ràng buộc khóa ngoại** được thực thi qua `PRAGMA foreign_keys=ON`
- **Dữ liệu mẫu** được lấy từ [JSONPlaceholder](https://jsonplaceholder.typicode.com) lần chạy đầu:
  - 10 users (với `address` và `company` lưu dưới dạng JSON, phân tích khi đọc)
  - 100 bài viết
  - 500 bình luận
  - 100 album
  - 5000 ảnh
  - 200 việc cần làm
  - 14 cài đặt (biến môi trường: `NODE_ENV`, `PORT`, `DB_PATH`, `DEBUG_SQL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`, `REDIS_URL`, `RATE_LIMIT_ENABLED`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `DEFAULT_PAGE_SIZE`, `ADMIN_KEY`)

### Script hỗ trợ

```bash
sqlite3 storage/data.db < manual/inspect-queries.sql
```

Script này chạy các truy vấn toàn diện để kiểm tra số lượng dòng, metadata cột, quan hệ, kiểm tra toàn vẹn và thống kê.

### Script Database

| Script        | Lệnh                   | Mô tả                                           |
|---------------|---------------------------|-------------------------------------------------------|
| `db:migrate`  | `npm run db:migrate`      | Tạo 7 bảng (dotenv được tải bởi config.js)            |
| `db:seed`     | `npm run db:seed`         | Lấy dữ liệu mẫu từ [JSONPlaceholder](https://jsonplaceholder.typicode.com), tự động chạy migrate + seed-settings |
| `db:seed-settings` | `npm run db:seed-settings` | Seed biến môi trường vào bảng `settings` (dotenv được tải bởi config.js) |
| `db:setup`    | `npm run db:setup`        | Chạy `db:seed` + `db:seed-settings` (migrate + JSONPlaceholder + env settings) |
| `test`        | `npm test`                | Chạy kiểm thử tích hợp vitest                         |
| `test:coverage` | `npm run test:coverage` | Chạy kiểm thử với báo cáo vùng phủ V8                 |

---

## Kiểm thử

Sử dụng **vitest** với **vùng phủ V8 gốc**. **250 bài kiểm thử trên 14 file** bao phủ toàn bộ stack — từ kiểm thử tích hợp (HTTP server thật + SQLite) đến kiểm thử đơn vị cho mọi module.

```bash
npm test              # Chạy tất cả kiểm thử một lần
npm run test:watch    # Chế độ watch
npm run test:coverage # Với báo cáo vùng phủ (100% trên mọi chỉ số)
```

Xem [tests/README.md](tests/README.md) để biết tài liệu đầy đủ.

## Giấy phép

[MIT](LICENSE) — Bản quyền (c) 2026 Dang Khoa &lt;i.am@dangkhoa.dev&gt;

## Ghi công

Dự án này có sử dụng tài nguyên đồ họa từ Flaticon:
* [Sustainability stickers](https://www.flaticon.com/free-stickers/sustainability) được sáng tạo bởi [Manuel Viveros - Flaticon](https://www.flaticon.com/authors/manuel-viveros?type=sticker)
