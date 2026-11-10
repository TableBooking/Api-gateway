# TableBooking API Gateway — NestJS

Gateway HTTP cho hệ thống đặt bàn một nhà hàng, viết bằng **NestJS 12 + TypeScript**,
chạy trên **Node.js 24 LTS (>=24.15)**. Gateway đứng giữa React và 5 service: Auth,
Booking, Operations, Tracking, Notification; không chứa database hoặc RabbitMQ client.

## Phạm vi

- Proxy theo danh sách method/path cho phép, giữ nguyên prefix `/api`, query và body.
- Xác minh access JWT HS256 bằng secret dùng chung với Auth, kiểm tra role CUSTOMER/STAFF/MANAGER.
- Chuyển tiếp Authorization, refresh cookie, Set-Cookie và Idempotency-Key.
- CORS có credentials và allowlist, Origin check cho refresh/logout, rate limit theo IP,
  security headers, request ID, JSON logging và health check.
- Docker build, Compose local/production, GitHub CI và phát hành image lên Docker Hub.

Gateway không phát token, không lưu refresh session, không quản lý bàn hay booking,
không phát/consume event. Service vẫn phải tự xác minh JWT, role và ownership.

## Chạy local

1. Cài Node.js 24 LTS mới nhất, tối thiểu 24.15 (`nvm install 24`, `nvm use 24`).
2. Cài dependency và tạo env:

```sh
npm ci
cp .env.example .env
```

PowerShell có thể dùng `Copy-Item .env.example .env`.

3. Sinh secret ngẫu nhiên và đặt `JWT_SECRET` trong `.env`, dùng cùng giá trị ở Auth
   và các backend xác minh token. Env mẫu chỉ có placeholder; app từ chối placeholder này.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Secret chỉ dành cho backend, không đưa vào frontend, Git hoặc image Docker.

4. Chốt `JWT_ISSUER`, `JWT_AUDIENCE` và claim `role` với Auth owner. Các giá trị mẫu là
   **hợp đồng đề xuất**, vì kế hoạch chưa cung cấp JWT payload thực tế.
5. Chỉnh URL 5 backend theo môi trường, rồi chạy:

```sh
npm run dev
curl http://localhost:8080/health/ready
```

Thiếu/secret quá ngắn hoặc còn placeholder thì gateway từ chối khởi động. Khi cấu hình hợp lệ, health vẫn hoạt
động dù backend chưa chạy; request tới backend ngừng hoạt động sẽ trả 502/504.

## Routing

| Nhóm path                          | Service      | Biến cấu hình              |
| ---------------------------------- | ------------ | -------------------------- |
| `/api/auth/*`, `/api/users/*`      | Auth         | `AUTH_SERVICE_URL`         |
| `/api/bookings`, `/api/bookings/*` | Booking      | `BOOKING_SERVICE_URL`      |
| `/api/operations/*`                | Operations   | `OPERATIONS_SERVICE_URL`   |
| `/api/tracking/*`                  | Tracking     | `TRACKING_SERVICE_URL`     |
| `/api/notifications/*`             | Notification | `NOTIFICATION_SERVICE_URL` |

Bảng trên là nhóm route; chỉ method/path cụ thể trong [API contract](docs/api-contract.md)
mới được expose. Không có Users Service độc lập. Ví dụ `/api/users/me` được chuyển
thành `${AUTH_SERVICE_URL}/api/users/me`; gateway không bỏ `/api`.

## Cấu trúc source

```text
src/
  main.ts                         Listen HTTP, shutdown hooks
  bootstrap.ts                    Tạo app, CORS, security và rate limit
  app.module.ts                   Module gốc và logging
  config/
    env.ts                        Schema env và type cấu hình
    configuration.module.ts       Nest ConfigModule + DI token
  common/
    filters/                      Chuẩn hóa lỗi do gateway tạo
    middleware/                   Request ID, lọc forwarded headers không tin cậy
    types/                        Request type dùng chung
  modules/
    auth/                         HS256 verifier và access guard
    routing/                      Method/path, target service, role policy
    proxy/                        Controller và streaming HTTP proxy
    health/                       Liveness/readiness
test/                             Config và HTTP integration tests
docs/                             Thiết kế và hợp đồng gateway
```

Không tạo module nghiệp vụ Auth/Booking/Operations trong repo này. Module `auth`
của gateway chỉ xác minh token và kiểm tra quyền truy cập route.

## Scripts

| Lệnh                                | Chức năng                                                         |
| ----------------------------------- | ----------------------------------------------------------------- |
| `npm run dev` / `npm run start:dev` | Nest CLI build/watch và chạy app                                  |
| `npm run check`                     | Typecheck, ESLint và Prettier                                     |
| `npm test`                          | Compile test rồi chạy Node test runner với 5 HTTP backend fixture |
| `npm run build`                     | Nest CLI compile vào `dist/`                                      |
| `npm start`                         | Chạy `dist/main.js`                                               |
| `npm run format`                    | Format code/config/docs                                           |

NestJS dùng decorators và metadata cho DI nên không chạy source trực tiếp bằng
Node type stripping. Project giữ ESM, import tương đối bằng `.js`, compiler resolve
về source `.ts`. Xem [quy trình phát triển](docs/development.md).

## Docker và CI

Env cho Docker tách riêng trong [.env.docker.example](.env.docker.example). Copy thành
`.env.docker`, chỉnh địa chỉ backend và JWT_SECRET rồi dùng Compose. Production dùng
[compose.prod.yaml](compose.prod.yaml) chỉ tham chiếu image, không có build context.

GitHub CI kiểm tra code và Docker smoke test. Push tag `v0.1.0` hoặc chạy workflow thủ
công để publish image lên Docker Hub sau khi CI thành công. Cần GitHub secrets
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`; variable `DOCKERHUB_REPOSITORY` mặc định `api-gateway`.
Chi tiết build, networking, publish, deploy và rollback nằm trong [deployment](docs/deployment.md).

## Tài liệu

Đọc theo [mục lục docs](docs/README.md):

1. [Architecture](docs/architecture.md)
2. [Proxy routing](docs/proxy-routing.md)
3. [Authentication và authorization](docs/authentication.md)
4. [Configuration](docs/configuration.md)
5. [API contract](docs/api-contract.md)
6. [Deployment](docs/deployment.md)
7. [Development](docs/development.md)

[AGENTS.md](AGENTS.md) hướng dẫn coding agent. Source hiện thực thi gateway policy;
khả năng tích hợp đầy đủ còn cần đồng bộ JWT_SECRET/JWT claims, port và API contract
từ repo các backend. Các test trong repo dùng fixture, chưa xác nhận nghiệp vụ hay
luồng RabbitMQ của toàn hệ thống.
