# Proxy routing

## Bảng target

| Route group                                                                                     | Target                     | Ví dụ upstream                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| `/api/auth`, `/api/users`                                                                       | `AUTH_SERVICE_URL`         | `http://localhost:3001/api/users/me`                      |
| `/api/bookings`                                                                                 | `BOOKING_SERVICE_URL`      | `http://localhost:3002/api/bookings/mine`                 |
| `/api/operations`                                                                               | `OPERATIONS_SERVICE_URL`   | `http://localhost:3003/api/operations/tables`             |
| `/api/restaurants/current`, `/api/restaurants/current/areas`, `/api/slots`, `/api/availability` | `OPERATIONS_SERVICE_URL`   | Public discovery V2, giữ nguyên path                      |
| `/api/tracking`                                                                                 | `TRACKING_SERVICE_URL`     | `http://localhost:3004/api/tracking/bookings/id/timeline` |
| `/api/notifications`                                                                            | `NOTIFICATION_SERVICE_URL` | `http://localhost:3005/api/notifications/mine`            |
| `/api/health`                                                                                   | Gateway local              | 200 `{"gateway":"ok"}`, không gọi backend                 |

Các port là mặc định tích hợp đề xuất, không được ấn định trong kế hoạch. Schema chỉ
chấp nhận HTTP(S) origin, không chứa credential, path, query hoặc fragment.

Gateway **giữ nguyên prefix `/api`**, không strip/rewrite như scaffold cũ. Đây là hợp
đồng tích hợp hiện tại: mỗi service cần expose các API trên cùng đường dẫn. Nếu
backend thực tế khác, chốt rewrite rõ ràng và sửa cả test/docs trước khi tích hợp.

## Allowlist method/path

[Route definitions](../src/modules/routing/routes.ts) là nguồn cấu hình duy nhất cho
method, path, target, public/role policy và Idempotency-Key. Không proxy toàn bộ
prefix một cách tự do: `/api/auth/internal`, `DELETE /api/auth/login`, endpoint health
nội bộ và route ngoài [API contract](api-contract.md) trả 404.

Bao phủ 41 operation OpenAPI V2; transition được mở rộng thành 7 action cụ thể
(47 registry entry), không nhận action tùy ý. Public discovery chỉ gồm bốn GET
liệt kê trên. Refresh/logout dùng trusted Origin + cookie tại Auth, không cần access JWT.

ID trong route nhận chữ ASCII, số, `_`, `-`, phù hợp UUID/ID mẫu của hệ thống. Không
nhận encoded slash, dot segment hoặc URL do client truyền để đổi upstream. Có thể
thêm một dấu `/` cuối route; query string được chuyển tiếp nguyên trạng.

## Stream và headers

Nest body parser bị tắt cho gateway. Guard chỉ đọc method/path/header; ProxyService
dùng `http-proxy-middleware` để stream request và response, không deserialize/
serialize lại JSON. Domain service tự validate payload và content type.

| Header                                                                                                            | Xử lý                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Authorization`                                                                                                   | Giữ nguyên Bearer token; service tiếp tục tự xác minh JWT                                         |
| `Idempotency-Key`                                                                                                 | Giữ nguyên; bắt buộc với `POST /api/bookings`                                                     |
| `Cookie`, `Set-Cookie`                                                                                            | Giữ nguyên, bao gồm nhiều Set-Cookie; Auth sở hữu cookie settings                                 |
| `Content-Type`, `Accept`                                                                                          | Theo proxy HTTP thông thường, không biến đổi DTO                                                  |
| `Host`                                                                                                            | Đổi theo target (`changeOrigin`)                                                                  |
| `x-request-id`                                                                                                    | Gateway sinh UUID, bỏ ID client/upstream và dùng cùng ID hai phía                                 |
| `x-user-id`, `x-user-role`, `x-user-roles`, `x-user-email`, `x-role`, `x-roles`, `x-auth-user-id`, `x-auth-roles` | Bỏ khỏi request upstream; không dùng làm identity                                                 |
| `Forwarded`, `X-Forwarded-*`                                                                                      | Không tin khi `TRUST_PROXY=false`; upstream nhận X-Forwarded-For/Proto do gateway dựng từ Express |
| `Access-Control-*` từ upstream                                                                                    | Bỏ để backend không mở rộng CORS policy của gateway                                               |

Gateway không parse refresh cookie, không thêm identity header thay JWT, không rewrite
cookie domain/path và không cache response. Auth phải cấu hình cookie đúng public
hostname/path. Service không được tin các identity header khác do client tự đặt.

## Lỗi và timeout

- Status/body nghiệp vụ đi nguyên trạng: ví dụ Booking trả 202 hoặc version conflict 409.
- Lỗi kết nối upstream: 502 `UPSTREAM_UNAVAILABLE`.
- Upstream socket không hoạt động trong `UPSTREAM_TIMEOUT_MS`: 504 `UPSTREAM_TIMEOUT`.
- Timeout là inactivity timeout, không phải tổng deadline cho một request streaming.
- Nếu response đã bắt đầu stream rồi mới lỗi, gateway đóng stream; không thể đổi status
  hoặc ghép JSON lỗi vào response đã gửi.
- Không retry, failover hoặc follow redirect tự động; tránh lặp POST booking/refresh.

Body bị giới hạn bởi `MAX_REQUEST_BODY_BYTES` (mặc định 1 MiB), tính theo byte truyền
trên HTTP, không giải nén/parse JSON. Content-Length vượt ngưỡng bị trả 413 trước khi
gọi upstream. Với chunked upload, gateway đếm byte khi proxy bắt đầu pipe, dừng upload
và trả 413 khi vượt ngưỡng; một phần body có thể đã tới backend trước khi phát hiện.
Backend phải chờ body hoàn chỉnh và tự validate trước khi thực thi command. Gateway
không buffer body, giữ nguyên byte và backpressure. Nếu upstream đã gửi response thì
gateway chỉ có thể đóng stream. Tổng deadline và WebSocket/SSE contract chưa được hỗ trợ riêng.
