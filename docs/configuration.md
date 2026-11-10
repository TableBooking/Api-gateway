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

| Biến                       | Mặc định                 | Ý nghĩa                                                                                      |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | `development`            | `development`, `test`, `production`                                                          |
| `HOST`                     | `0.0.0.0`                | Interface HTTP listen                                                                        |
| `PORT`                     | `8080`                   | Số nguyên 1–65535                                                                            |
| `LOG_LEVEL`                | `info`                   | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                                 |
| `CORS_ORIGINS`             | rỗng                     | Origin phân cách bằng dấu phẩy; chuẩn hóa protocol/host/port                                 |
| `TRUST_PROXY`              | `false`                  | Literal `true`/`false`, tin forwarded headers từ ingress hay không                           |
| `RATE_LIMIT_MAX`           | `100`                    | Global request/IP/window/process, trừ health                                                 |
| `AUTH_RATE_LIMIT_MAX`      | `10`                     | Ngân sách riêng chung cho register/login/refresh/logout, bổ sung global limit                |
| `RATE_LIMIT_WINDOW_MS`     | `60000`                  | Window rate limit tính bằng ms, số nguyên dương                                              |
| `UPSTREAM_TIMEOUT_MS`      | `10000`                  | Upstream socket inactivity timeout, ms                                                       |
| `MAX_REQUEST_BODY_BYTES`   | `1048576`                | Giới hạn byte body (cả Content-Length/chunked), số nguyên dương an toàn; vượt ngưỡng trả 413 |
| `AUTH_SERVICE_URL`         | `http://localhost:3001`  | Target của auth và users API                                                                 |
| `BOOKING_SERVICE_URL`      | `http://localhost:3002`  | Target của bookings API                                                                      |
| `OPERATIONS_SERVICE_URL`   | `http://localhost:3003`  | Target quản lý bàn/reservations                                                              |
| `TRACKING_SERVICE_URL`     | `http://localhost:3004`  | Target timeline                                                                              |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3005`  | Target notifications                                                                         |
| `JWT_PUBLIC_KEY_PATH`      | `./keys/auth-public.pem` | RSA SPKI PEM public key, tối thiểu 2048 bit, phải đọc được lúc startup                       |
| `JWT_ISSUER`               | `restaurant-auth`        | Giá trị `iss` phải khớp Auth                                                                 |
| `JWT_AUDIENCE`             | `restaurant-api`         | Giá trị `aud` phải khớp Auth                                                                 |

Upstream chỉ nhận HTTP(S) origin, ví dụ `http://auth:3001`; không nhận credential,
path khác `/`, query hoặc fragment. Gateway thêm nguyên request path `/api/...`.
Port/DNS mặc định là **đề xuất tích hợp**. Issuer/audience mặc định theo bàn giao V2:
`restaurant-auth` / `restaurant-api`. Vẫn phải xác nhận Auth thật phát đúng claims
và phân phối public key cùng cặp; không dùng fixture thay bằng chứng tích hợp.

CORS rỗng không cấp quyền cross-origin cho browser và sẽ từ chối Origin của
refresh/logout. Ví dụ local: `CORS_ORIGINS=http://localhost:5173,http://localhost:8080`.
Thêm origin của public web thực tế khi deploy. CORS không ngăn curl hoặc thay thế auth.

## Biến cho Docker Compose

| Biến                  | Mặc định                                         | Ý nghĩa                                      |
| --------------------- | ------------------------------------------------ | -------------------------------------------- |
| `GATEWAY_IMAGE`       | local: `api-gateway:local`; production: bắt buộc | Docker Hub image/tag/digest                  |
| `BIND_ADDRESS`        | `127.0.0.1`                                      | Interface publish port trên host             |
| `PORT`                | `8080`                                           | Cổng host; trong container luôn 8080         |
| `JWT_PUBLIC_KEY_FILE` | `./keys/auth-public.pem`                         | File public key trên host để mount read-only |
| `PLATFORM_NETWORK`    | `tablebooking-platform`                          | External network của Compose production      |

Compose mount `JWT_PUBLIC_KEY_FILE` trên host vào `/run/secrets/auth_public_key` và
đặt `JWT_PUBLIC_KEY_PATH` trong container về đường dẫn đó. Không mount private key.
`NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080` được cố định bên trong container.
Validate Compose không cần key tồn tại; chạy container thật cần file public key hợp lệ.

Không cần `JWT_SECRET` khi dùng RS256. Chỉ cặp RSA là sinh ngẫu nhiên; issuer/audience
là hai tên tự quy ước có thể giữ `restaurant-auth` và `restaurant-api`. Auth phải
ghi đúng hai giá trị này vào claims `iss`/`aud`; gateway/backend dùng cùng giá trị để
verify. Xem từng bước sinh và phân phối key trong [authentication](authentication.md).

Trong container, `localhost` chỉ chính gateway. Dùng DNS `auth`, `booking`, ... trên
network chung hoặc địa chỉ nội bộ có thể truy cập. Compose local có sẵn alias
`host.docker.internal` để gọi backend chạy trên host; production dùng external
network và yêu cầu target URL cụ thể. Xem [deployment](deployment.md).
