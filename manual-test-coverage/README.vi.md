# Công cụ kiểm tra mức độ bao phủ

> 🌐 Language / Ngôn ngữ: [English](README.md) | **Tiếng Việt**

Thư mục này chứa script để kiểm tra mức độ bao phủ mã nguồn (code coverage) qua lịch sử commit.

## Các file

- `verify-commit-coverage.sh` — duyệt từng commit trong một khoảng, kiểm tra coverage, tạo báo cáo
- `coverage-report.md` — báo cáo markdown được sinh ra (đã gitignore)
- `results/` — nhật ký thô từng commit (đã gitignore)

## Cách dùng

Chạy từ thư mục gốc của dự án:

```bash
bash manual-test-coverage/verify-commit-coverage.sh
```

Có thể chỉ định khoảng commit:

```bash
bash manual-test-coverage/verify-commit-coverage.sh <base-sha> <head-sha>
```

Mỗi commit được checkout, chạy `yarn test:coverage`, thu thập tỷ lệ coverage, và ghi báo cáo markdown vào `coverage-report.md`.

## Yêu cầu

- `yarn` và `vitest` đã cấu hình `--coverage`
- (Không bắt buộc) `mise` — nếu có, script sẽ dùng nó để khôi phục môi trường Node.js cho mỗi commit
