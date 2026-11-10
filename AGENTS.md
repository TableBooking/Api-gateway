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
- `auth/` xác minh RS256/access policy; `proxy/` stream HTTP; `health/` phục vụ probes.
- NestJS là gateway duy nhất. Chỉ Auth giữ RSA private key; gateway chỉ nhận public key khớp Auth.

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
8. Trong Auth chỉ public register/login; refresh/logout dùng refresh cookie + Origin allowlist,
   không phụ thuộc access JWT còn hạn. Không public toàn bộ `/api/auth/*`.
   OpenAPI V2 còn public GET restaurant current/areas, slots, availability và gateway health.
9. Không nhận upstream URL từ request, không wildcard CORS, không bật trust proxy mặc định.
10. Không commit `.env`, `.env.docker`, secret, token; không sửa `dist/`, `.test-dist/`,
    `node_modules/` thủ công. Chỉ mount public key lúc runtime, không đưa private key vào gateway/image.
11. Không log token, cookie, body hoặc query string. Dùng Pino và request ID do gateway tạo.
12. OpenAPI V2 và bàn giao JWT là contract mục tiêu (iss=restaurant-auth, aud=restaurant-api).
    Không mô tả fixture hoặc contract mục tiêu là tích hợp backend thật đã xác nhận.

## Kiểm tra trước khi bàn giao

```sh
npm run check
npm test
npm run build
```

Test HTTP backend local trên cổng ngẫu nhiên; không cần Auth thật hoặc key hệ thống.
Test RSA private key ở trong bộ nhớ; public key/CLI key generation dùng thư mục tạm
và được dọn sau test. Lệnh keys:generate chỉ phục vụ provisioning, không chạy khi startup;
không ghi đè key có sẵn. Nếu Auth đã có key, dùng public key hiện có thay vì sinh cặp mới.

Khi sửa Docker/deploy, chạy thêm:

```sh
docker compose --env-file .env.docker.example config --quiet
docker compose --env-file .env.docker.example -f compose.prod.yaml config --quiet
docker build -t api-gateway:check .
```

Compose config có thể validate bằng env mẫu khi chưa có backend/network/key;
chạy container thật cần public key hợp lệ khớp Auth và kết nối tới backend.
Báo rõ kiểm tra nào chưa chạy nếu môi trường thiếu Docker daemon.
Không khẳng định image đã push khi chưa có kết quả registry/workflow.

## Phát hành

GitHub CI kiểm tra PR/main; workflow Docker Hub chạy khi tag `v*` hoặc thủ công sau CI.
Secrets do chủ repository cấu hình, không đưa credential vào source hay command history.
Production dùng Compose image-only với tag/digest cụ thể; xem [deployment](docs/deployment.md).
