# Configuration

## Cách nạp cấu hình

[ConfigurationModule](../src/config/configuration.module.ts) dùng Nest ConfigModule
để load `.env` tại thư mục chạy app. Biến môi trường của process có độ ưu tiên cao
hơn file. [Schema](../src/config/env.ts) validate bằng Zod, cung cấp object typed qua
DI token `GATEWAY_CONFIG`. Config sai làm startup thất bại, báo field/lý do và không
in giá trị credential.

- Chạy Nest local: copy [.env.example](../.env.example) thành `.env`.
- Chạy Docker: copy [.env.docker.example](../.env.docker.example) thành `.env.docker`,
  dùng `docker compose --env-file .env.docker ...`.
- `.env.docker` là input cho Compose interpolation, không tự được Nest đọc trong image.
  Compose truyền các biến khai báo ở `environment` vào container.
- Không commit các file env thật hoặc secret. Không có DB/Rabbit/SMTP env trong gateway.

## Environment của application

| Biến                       | Mặc định                   | Ý nghĩa                                                                          |
| -------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`              | `development`, `test`, `production`                                              |
| `HOST`                     | `0.0.0.0`                  | Interface HTTP listen                                                            |
| `PORT`                     | `8080`                     | Số nguyên 1–65535                                                                |
| `LOG_LEVEL`                | `info`                     | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                     |
| `CORS_ORIGINS`             | rỗng                       | Origin phân cách bằng dấu phẩy; chuẩn hóa protocol/host/port                     |
| `TRUST_PROXY`              | `false`                    | Literal `true`/`false`, tin forwarded headers từ ingress hay không               |
| `RATE_LIMIT_MAX`           | `100`                      | Global request/IP/window/process, trừ health                                     |
| `AUTH_RATE_LIMIT_MAX`      | `10`                       | Ngân sách riêng chung cho register/login/refresh/logout, bổ sung global limit    |
| `RATE_LIMIT_WINDOW_MS`     | `60000`                    | Window rate limit tính bằng ms, số nguyên dương                                  |
| `UPSTREAM_TIMEOUT_MS`      | `10000`                    | Upstream socket inactivity timeout, ms                                           |
| `AUTH_SERVICE_URL`         | `http://localhost:3001`    | Target của auth và users API                                                     |
| `BOOKING_SERVICE_URL`      | `http://localhost:3002`    | Target của bookings API                                                          |
| `OPERATIONS_SERVICE_URL`   | `http://localhost:3003`    | Target quản lý bàn/reservations                                                  |
| `TRACKING_SERVICE_URL`     | `http://localhost:3004`    | Target timeline                                                                  |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3005`    | Target notifications                                                             |
| `JWT_SECRET`               | bắt buộc, không có default | Secret HS256 ít nhất 32 byte UTF-8, không rỗng/trắng hoặc placeholder; khớp Auth |
| `JWT_ISSUER`               | `tablebooking-auth`        | Giá trị `iss` phải khớp Auth                                                     |
| `JWT_AUDIENCE`             | `tablebooking-api`         | Giá trị `aud` phải khớp Auth                                                     |

Upstream chỉ nhận HTTP(S) origin, ví dụ `http://auth:3001`; không nhận credential,
path khác `/`, query hoặc fragment. Gateway thêm nguyên request path `/api/...`.
Port/DNS và issuer/audience mặc định là **đề xuất tích hợp** vì kế hoạch không chỉ rõ
các giá trị này. Không dùng chúng thay cho việc xác nhận cấu hình các backend.

CORS rỗng không cấp quyền cross-origin cho browser và sẽ từ chối Origin của
refresh/logout. Ví dụ local: `CORS_ORIGINS=http://localhost:5173,http://localhost:8080`.
Thêm origin của public web thực tế khi deploy. CORS không ngăn curl hoặc thay thế auth.

## Biến cho Docker Compose

| Biến               | Mặc định                                         | Ý nghĩa                                 |
| ------------------ | ------------------------------------------------ | --------------------------------------- |
| `GATEWAY_IMAGE`    | local: `api-gateway:local`; production: bắt buộc | Docker Hub image/tag/digest             |
| `BIND_ADDRESS`     | `127.0.0.1`                                      | Interface publish port trên host        |
| `PORT`             | `8080`                                           | Cổng host; trong container luôn 8080    |
| `PLATFORM_NETWORK` | `tablebooking-platform`                          | External network của Compose production |

Compose truyền `JWT_SECRET` từ env vào container lúc chạy, không lưu trong image.
`NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080` được cố định bên trong container.
Env mẫu chứa placeholder chỉ để minh họa/validate Compose; phải thay bằng secret
ngẫu nhiên trước khi chạy app. Không gửi output `docker compose config` có giá trị
secret cho người khác; dùng `config --quiet` khi kiểm tra.

Gateway đọc secret theo chuỗi UTF-8 nguyên trạng, không tự giải mã hex/base64. Auth
và các backend phải dùng cùng giá trị và encoding. Sinh secret từ ít nhất 32 byte
ngẫu nhiên, ví dụ lệnh trong [authentication](authentication.md), rồi đặt vào env
chỉ phía server. Không đặt JWT_SECRET trong biến `VITE_*`, React hoặc GitHub build args.

Trong container, `localhost` chỉ chính gateway. Dùng DNS `auth`, `booking`, ... trên
network chung hoặc địa chỉ nội bộ có thể truy cập. Compose local có sẵn alias
`host.docker.internal` để gọi backend chạy trên host; production dùng external
network và yêu cầu target URL cụ thể. Xem [deployment](deployment.md).
