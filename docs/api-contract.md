# API contract của gateway

## Phạm vi hợp đồng

Danh sách method/path và quyền dưới đây lấy từ kế hoạch NestJS V1. Gateway đã expose
các route này; chúng không đồng nghĩa backend tương ứng đã triển khai hoặc được E2E
kiểm chứng. DTO/response hoàn chỉnh phải được owner từng service chốt bằng OpenAPI.
Gateway không tạo schema nghiệp vụ suy đoán hoặc sinh response thay backend.

Base URL local: `http://localhost:8080`. Upstream nhận cùng path `/api/...` và query.
ID route nhận `[A-Za-z0-9_-]+`. Route/method ngoài danh sách trả 404, không forward.

## Headers

| Header                           | Quy tắc                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `Authorization: Bearer <token>`  | Bắt buộc với API bảo vệ, JWT HS256                                              |
| `Content-Type: application/json` | Dùng cho JSON body của domain API                                               |
| `Idempotency-Key`                | Bắt buộc, không rỗng với POST `/api/bookings`; service lưu và xử lý idempotency |
| `Cookie`                         | Gửi refresh cookie tới Auth theo cookie contract của service                    |
| `Origin`                         | Bắt buộc được allowlist cho refresh/logout                                      |
| `x-request-id` response          | UUID do gateway sinh; dùng khi đối chiếu log hoặc báo lỗi                       |

Frontend cross-origin cần `credentials: 'include'` cho cookie flow. Gateway không
đổi status/body, Set-Cookie hoặc Authorization do backend cung cấp. Lỗi nghiệp vụ
không bị bọc trong response envelope mới.

## Auth và user — Auth Service

| Method | Path                 | Gateway policy | Trách nhiệm Auth                            |
| ------ | -------------------- | -------------- | ------------------------------------------- |
| POST   | `/api/auth/register` | Public         | Tạo CUSTOMER, không cho client tự chọn role |
| POST   | `/api/auth/login`    | Public         | Access JWT HS256 + refresh cookie           |
| POST   | `/api/auth/refresh`  | Trusted Origin | Verify cookie, rotate refresh session       |
| POST   | `/api/auth/logout`   | Trusted Origin | Revoke refresh session                      |
| GET    | `/api/users/me`      | JWT            | Profile của `sub`                           |
| POST   | `/api/users/staff`   | MANAGER        | Tạo STAFF theo rule Auth                    |

Body register theo kế hoạch: `email`, `password`, `fullName`; login: `email`, `password`.
Tên cookie, token TTL và response schema cần Auth owner chốt. JWT claims hiện dùng
hợp đồng đề xuất trong [authentication](authentication.md); JWT_SECRET chỉ chia sẻ giữa backend.

## Booking — Booking Service

| Method | Path                                      | Gateway policy        | Kiểm tra tại Booking                                       |
| ------ | ----------------------------------------- | --------------------- | ---------------------------------------------------------- |
| POST   | `/api/bookings`                           | JWT + Idempotency-Key | Validate slot/partySize, idempotency, ghi request + outbox |
| GET    | `/api/bookings/mine`                      | JWT                   | Chỉ booking của người gọi                                  |
| GET    | `/api/bookings/:id`                       | JWT                   | Owner hoặc STAFF/MANAGER                                   |
| POST   | `/api/bookings/:id/cancellation-requests` | JWT                   | Owner, tạo command async                                   |
| GET    | `/api/bookings/commands/:commandId`       | JWT                   | Owner của command                                          |

Ví dụ request theo kế hoạch:

```http
POST /api/bookings
Authorization: Bearer <accessToken>
Content-Type: application/json
Idempotency-Key: create-001

{"slotId":"2026-11-08-dinner","partySize":2,"note":"Window preferred"}
```

Service trả **202**, bookingId và trạng thái **QUEUED**. Gateway không đổi sang 200/201,
không báo CONFIRMED và không đợi RabbitMQ/Operations. Đây là cam kết semantic của
kế hoạch; tên field response JSON chi tiết cần chốt với Booking owner.

Cùng key và body phải chỉ tạo một booking; key được dùng lại với body khác trả 409
tại Booking. Gateway không lưu key, không so body/hash và không retry request.

## Operations — Operations Service

| Method | Path                                        | Gateway policy |
| ------ | ------------------------------------------- | -------------- |
| GET    | `/api/operations/tables`                    | STAFF, MANAGER |
| POST   | `/api/operations/tables`                    | MANAGER        |
| PATCH  | `/api/operations/tables/:id`                | MANAGER        |
| GET    | `/api/operations/reservations?slotId=...`   | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/confirm`  | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/reject`   | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/cancel`   | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/check-in` | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/seat`     | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/complete` | STAFF, MANAGER |
| POST   | `/api/operations/reservations/:id/no-show`  | STAFF, MANAGER |

Không chấp nhận `:action` tùy ý. Body action có `expectedVersion`, thêm `tableId`
khi confirm và `reason` khi reject/cancel theo kế hoạch. Operations quyết định state
transition, time guards, allocation, transaction và version conflict; gateway không
đọc/sửa các field này.

## Tracking và Notification

| Method | Path                                  | Gateway policy | Kiểm tra tại service       |
| ------ | ------------------------------------- | -------------- | -------------------------- |
| GET    | `/api/tracking/bookings/:id/timeline` | JWT            | Owner hoặc STAFF/MANAGER   |
| GET    | `/api/notifications/mine`             | JWT            | Notification của người gọi |
| POST   | `/api/notifications/:eventId/read`    | JWT            | Owner của notification     |

Timeline/projection có thể cập nhật trễ do eventual consistency. Gateway không ghép
dữ liệu từ các service hay biến Notification outage thành lỗi của Booking.

## Lỗi do gateway tạo

```json
{
  "statusCode": 401,
  "code": "UNAUTHORIZED",
  "message": "A valid access token is required",
  "requestId": "gateway-generated-uuid"
}
```

| Status | Code                       | Trigger                                                |
| ------ | -------------------------- | ------------------------------------------------------ |
| 400    | `IDEMPOTENCY_KEY_REQUIRED` | POST Booking thiếu/rỗng key sau khi auth thành công    |
| 401    | `UNAUTHORIZED`             | JWT thiếu, sai, hết hạn hoặc không đúng claim contract |
| 403    | `FORBIDDEN`                | Role không được phép                                   |
| 403    | `ORIGIN_NOT_ALLOWED`       | Refresh/logout thiếu hoặc sai Origin                   |
| 404    | `ROUTE_NOT_FOUND`          | Method/path chưa expose                                |
| 429    | `RATE_LIMITED`             | Global hoặc auth rate limit; có Retry-After            |
| 502    | `UPSTREAM_UNAVAILABLE`     | Không kết nối được upstream                            |
| 504    | `UPSTREAM_TIMEOUT`         | Upstream timeout trước khi stream response             |
| 500    | `GATEWAY_ERROR`            | Lỗi nội bộ gateway; message không lộ chi tiết          |

Status/body do backend trả, như 400 DTO, 401 refresh, 403 ownership hoặc 409 state/
idempotency conflict, được giữ nguyên. Không yêu cầu chúng dùng cùng envelope lỗi
của gateway cho đến khi các service chốt error contract chung.

## Health

`GET /health/live` → 200 `{"status":"ok"}`.
`GET /health/ready` → 200 `{"status":"ready"}` sau app init/config validation.
Public, miễn rate limit, không probe backend. Không có endpoint nội bộ của service
được public tự động qua gateway.

## Cần chốt trước E2E

1. Backend có global prefix `/api`, port/DNS đúng env hay cần rewrite có chủ đích.
2. Auth dùng HS256 với cùng JWT_SECRET, issuer/audience, tên claim role, cookie path/domain/SameSite và CSRF policy.
3. DTO, response fields, status và error codes chính thức từ OpenAPI từng service.
4. Semantics idempotency/cancellation command và frontend polling sau 202.
5. Contract tests với service thật cho ownership, concurrency và Notification down/up;
   fixture test trong gateway không thay các acceptance test hệ thống này.
