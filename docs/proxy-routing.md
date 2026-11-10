# Proxy routing

## Bảng target

| Route group               | Target                     | Ví dụ upstream                                            |
| ------------------------- | -------------------------- | --------------------------------------------------------- |
| `/api/auth`, `/api/users` | `AUTH_SERVICE_URL`         | `http://localhost:3001/api/users/me`                      |
| `/api/bookings`           | `BOOKING_SERVICE_URL`      | `http://localhost:3002/api/bookings/mine`                 |
| `/api/operations`         | `OPERATIONS_SERVICE_URL`   | `http://localhost:3003/api/operations/tables`             |
| `/api/tracking`           | `TRACKING_SERVICE_URL`     | `http://localhost:3004/api/tracking/bookings/id/timeline` |
| `/api/notifications`      | `NOTIFICATION_SERVICE_URL` | `http://localhost:3005/api/notifications/mine`            |

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

Giới hạn kích thước body/upload và deadline tổng cần bổ sung middleware tại gateway
có kiểm thử stream. Gateway hiện không buffer toàn bộ body để áp
DTO validation/body limit. WebSocket/SSE contract chưa được hỗ trợ riêng.
