# Hướng dẫn làm việc với repository

## Mục tiêu

Đây là **NestJS API Gateway** cho TableBooking: React → Gateway → Auth, Booking,
Operations, Tracking, Notification. Đọc [README](README.md), [architecture](docs/architecture.md)
và [API contract](docs/api-contract.md) trước khi sửa.

Yêu cầu NestJS mới thay thế scaffold Fastify trước đó. Gateway không kết nối database,
RabbitMQ, SMTP; không thực thi booking state machine, outbox/inbox hoặc nghiệp vụ.
Không triển khai lại Auth Service trong gateway.

## Stack và cấu trúc

- Node.js 24 LTS >=24.15, npm, NestJS 12 với Express adapter, TypeScript strict, ESM.
- Dùng `npm ci` và commit lockfile khi đổi dependency; không đổi package manager.
- Source import tương đối dùng `.js`, TypeScript NodeNext resolve về `.ts`.
- Dùng `import type` cho interface/type. Injectable class dùng trong constructor DI
  phải import runtime để compiler emit metadata đúng.
- Giữ `experimentalDecorators` và `emitDecoratorMetadata`. Không dùng native Node
  type stripping cho source NestJS; build/watch bằng Nest CLI.
- `main.ts` là entrypoint listen/shutdown; `bootstrap.ts` tạo app có thể dùng trong test.
- Config đọc qua `config/configuration.module.ts` + `config/env.ts`, inject `GATEWAY_CONFIG`.
- Route/method/role khai báo duy nhất ở `modules/routing/routes.ts`.
- `auth/` xác minh HS256/access policy; `proxy/` stream HTTP; `health/` phục vụ probes.
- NestJS là gateway duy nhất trong thiết kế. JWT_SECRET chỉ nằm phía backend và phải khớp Auth.

## Quy tắc thay đổi

1. Kiểm tra diff hiện có, giữ nguyên thay đổi không liên quan của người dùng.
2. Khi thêm env, cập nhật schema, hai env mẫu, Compose local/production và
   [configuration](docs/configuration.md).
3. Khi đổi API, cập nhật route registry, role/public policy,
   [proxy routing](docs/proxy-routing.md), [API contract](docs/api-contract.md) và test.
4. `/api/users` thuộc Auth. Giữ nguyên `/api` tới backend theo hợp đồng hiện tại.
   Không tạo wildcard proxy theo mỗi prefix làm lộ endpoint nội bộ.
5. Không bật body parser hoặc ValidationPipe cho payload proxy nếu chưa có cơ chế
   giữ nguyên stream. DTO nghiệp vụ thuộc domain service.
6. Không retry request tự động, đặc biệt POST Booking/refresh. Idempotency do Booking
   lưu và xử lý; gateway chỉ bắt buộc/chuyển tiếp header cho create booking.
7. Backend vẫn xác minh JWT/ownership. Không tin header `x-user-*` từ client;
   Authorization JWT mới là bằng chứng xác thực.
8. Chỉ public register/login; refresh/logout dùng refresh cookie + Origin allowlist,
   không phụ thuộc access JWT còn hạn. Không public toàn bộ `/api/auth/*`.
9. Không nhận upstream URL từ request, không wildcard CORS, không bật trust proxy mặc định.
10. Không commit `.env`, `.env.docker`, secret, token; không sửa `dist/`, `.test-dist/`,
    `node_modules/` thủ công. JWT_SECRET được truyền lúc runtime, không đưa vào frontend/image.
11. Không log token, cookie, body hoặc query string. Dùng Pino và request ID do gateway tạo.
12. Kế hoạch chưa có OpenAPI/JWT payload backend hoàn chỉnh. Không mô tả giả định
    tích hợp là hợp đồng đã được backend xác nhận; ghi rõ trong tài liệu.

## Kiểm tra trước khi bàn giao

```sh
npm run check
npm test
npm run build
```

Test HTTP backend local trên cổng ngẫu nhiên; không cần Auth thật hoặc secret hệ thống.
Test secret HS256 chỉ sinh ngẫu nhiên trong bộ nhớ và không ghi vào file.

Khi sửa Docker/deploy, chạy thêm:

```sh
docker compose --env-file .env.docker.example config --quiet
docker compose --env-file .env.docker.example -f compose.prod.yaml config --quiet
docker build -t api-gateway:check .
```

Compose config có thể validate bằng placeholder env mẫu khi chưa có backend/network;
chạy container thật phải thay JWT_SECRET bằng giá trị ngẫu nhiên hợp lệ và khớp Auth.
Báo rõ kiểm tra nào chưa chạy nếu môi trường thiếu Docker daemon.
Không khẳng định image đã push khi chưa có kết quả registry/workflow.

## Phát hành

GitHub CI kiểm tra PR/main; workflow Docker Hub chạy khi tag `v*` hoặc thủ công sau CI.
Secrets do chủ repository cấu hình, không đưa credential vào source hay command history.
Production dùng Compose image-only với tag/digest cụ thể; xem [deployment](docs/deployment.md).
