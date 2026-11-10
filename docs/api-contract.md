# API contract của gateway

## Nguồn và phạm vi

Gateway bám [OpenAPI V2](https://github.com/TableBooking/docs/blob/82444c44a2bebbbe077e2cb9969a70f3a0ce026b/restaurant-nestjs-playbook-team/contracts/openapi/restaurant-api-v2.yaml)
và [bàn giao Auth/JWT](https://github.com/TableBooking/docs/blob/82444c44a2bebbbe077e2cb9969a70f3a0ce026b/restaurant-nestjs-playbook-team/shared/07-BAN-GIAO-GIUA-CAC-NGUOI.md).
Đây là **contract mục tiêu**, chưa phải xác nhận các backend đã triển khai hoặc vượt E2E.

Đã expose đủ **41 operation V2**: Auth 10, Operations 17, Booking 5, Tracking 2,
Notification 6, Gateway health 1. Operation transition được triển khai bằng allowlist
7 action, nên registry có 47 entry. Hai probe vận hành ngoài V2 vẫn được giữ.
[Snapshot kiểm thử](../test/contracts/v2-operations.json) được trích độc lập từ OpenAPI
ở commit trên; test so khớp cả method/path, target và policy của ba role.

Base URL local: `http://localhost:8080`. Upstream nhận nguyên path `/api/...`, query
và body. Chỉ các method/path dưới đây được expose; ngoài allowlist trả 404.
ID path nhận `[A-Za-z0-9_-]+`; UUID `sub` trong JWT được kiểm tra riêng.

## Headers và authentication

| Header                          | Quy tắc                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <token>` | Bắt buộc cho API bảo vệ; RS256, `sub` UUID, `role`, `exp`, `iss`/`aud` đúng env             |
| `Content-Type`                  | Chuyển nguyên tới service; DTO/validation thuộc service                                     |
| `Idempotency-Key`               | Bắt buộc không rỗng với POST `/api/bookings`                                                |
| `Cookie`, `Set-Cookie`          | Giữ nguyên, kể cả nhiều Set-Cookie; Auth sở hữu refresh session                             |
| `Origin`                        | Bắt buộc thuộc `CORS_ORIGINS` cho refresh/logout, không cần access JWT                      |
| `x-request-id`                  | Gateway sinh UUID cho response/upstream; cùng giá trị với `correlationId` trong lỗi gateway |

JWT mặc định: `iss=restaurant-auth`, `aud=restaurant-api`. Auth giữ private key;
gateway/backend nhận public key cùng cặp. Xem [authentication](authentication.md).
FE cross-origin dùng `credentials: 'include'` cho cookie flow.

## Auth

| Method | Path                        | Gateway policy                           |
| ------ | --------------------------- | ---------------------------------------- |
| POST   | `/api/auth/register`        | Public                                   |
| POST   | `/api/auth/login`           | Public                                   |
| POST   | `/api/auth/refresh`         | Refresh cookie tại Auth + trusted Origin |
| POST   | `/api/auth/logout`          | Refresh cookie tại Auth + trusted Origin |
| POST   | `/api/auth/change-password` | JWT                                      |
| GET    | `/api/users/me`             | JWT                                      |
| PATCH  | `/api/users/me`             | JWT                                      |
| GET    | `/api/users/staff`          | MANAGER                                  |
| POST   | `/api/users/staff`          | MANAGER                                  |
| PATCH  | `/api/users/{id}/status`    | MANAGER                                  |

## Operations

| Method | Path                                         | Gateway policy |
| ------ | -------------------------------------------- | -------------- |
| GET    | `/api/restaurants/current`                   | Public         |
| GET    | `/api/restaurants/current/areas`             | Public         |
| GET    | `/api/slots`                                 | Public         |
| GET    | `/api/availability`                          | Public         |
| GET    | `/api/operations/reservations`               | STAFF, MANAGER |
| GET    | `/api/operations/reservations/{id}`          | STAFF, MANAGER |
| POST   | `/api/operations/reservations/{id}/{action}` | STAFF, MANAGER |
| GET    | `/api/operations/tables`                     | STAFF, MANAGER |
| POST   | `/api/operations/tables`                     | MANAGER        |
| PATCH  | `/api/operations/tables/{id}`                | MANAGER        |
| GET    | `/api/operations/areas`                      | STAFF, MANAGER |
| POST   | `/api/operations/areas`                      | MANAGER        |
| PATCH  | `/api/operations/areas/{id}`                 | MANAGER        |
| GET    | `/api/operations/slot-configs`               | STAFF, MANAGER |
| POST   | `/api/operations/slot-configs`               | MANAGER        |
| PATCH  | `/api/operations/slot-configs/{code}`        | MANAGER        |
| GET    | `/api/operations/stats/summary`              | MANAGER        |

## Booking

| Method | Path                                       | Gateway policy        |
| ------ | ------------------------------------------ | --------------------- |
| POST   | `/api/bookings`                            | JWT + Idempotency-Key |
| GET    | `/api/bookings/mine`                       | JWT                   |
| GET    | `/api/bookings/{id}`                       | JWT                   |
| POST   | `/api/bookings/{id}/cancellation-requests` | JWT                   |
| GET    | `/api/bookings/commands/{commandId}`       | JWT                   |

## Tracking

| Method | Path                                   | Gateway policy |
| ------ | -------------------------------------- | -------------- |
| GET    | `/api/tracking/bookings/{id}/timeline` | JWT            |
| GET    | `/api/tracking/bookings/{id}/status`   | JWT            |

## Notification

| Method | Path                              | Gateway policy |
| ------ | --------------------------------- | -------------- |
| GET    | `/api/notifications/mine`         | JWT            |
| GET    | `/api/notifications/unread-count` | JWT            |
| POST   | `/api/notifications/{id}/read`    | JWT            |
| POST   | `/api/notifications/read-all`     | JWT            |
| GET    | `/api/notifications/preferences`  | JWT            |
| PATCH  | `/api/notifications/preferences`  | JWT            |

## Gateway

| Method | Path          | Gateway policy |
| ------ | ------------- | -------------- |
| GET    | `/api/health` | Public         |

## Semantics của domain service

- Auth phải ép register thành CUSTOMER; profile chỉ cho sửa field theo OpenAPI,
  tạo STAFF/khóa tài khoản theo MANAGER. Gateway không parse hoặc sửa DTO.
- Public restaurant/areas/slots/availability thuộc Operations; availability chỉ
  tham khảo, không giữ bàn. Chỉ expose đúng bốn GET public này.
- Booking create trả **202** với `bookingId`, `processingStatus: QUEUED` (không phải
  `status`). Gateway giữ nguyên response, không chờ xác nhận và không báo CONFIRMED.
- Booking lưu/xử lý idempotency: cùng key/body chỉ một booking; key trùng/body khác
  trả 409. Gateway không lưu key và không retry POST/refresh hay request khác.
- Cancellation trả 202 với `commandId`, `bookingId`, `status: PENDING`; FE poll command.
- Transition chỉ nhận `confirm`, `reject`, `cancel`, `check-in`, `seat`, `complete`,
  `no-show`. Operations kiểm tra `expectedVersion`, `tableId` khi confirm,
  `reason` khi reject/cancel, state/time guards và transaction chống cấp trùng bàn.
- Notification `POST /api/notifications/{id}/read` dùng **notification job ID**,
  không phải eventId. Gateway chỉ chuyển path; Notification phải thực thi V2.
- Ownership ở Booking/Tracking/Notification dựa JWT `sub`; backend tiếp tục tự verify
  token/role. Không tin identity headers từ client; gateway loại các header này.
- Response DTO, camelCase, pagination `{data,meta}`, status và lỗi nghiệp vụ do
  backend trả được giữ nguyên. Gateway không chuyển response V1 thành V2.
- Projection/timeline cập nhật eventual consistency; gateway không ghép dữ liệu,
  không kết nối DB/RabbitMQ và không thực thi outbox/inbox.

## Lỗi do gateway tạo

Theo schema `Error` V2 (không thêm `statusCode` hoặc `requestId` vào JSON):

```json
{
  "code": "UNAUTHORIZED",
  "message": "A valid access token is required",
  "correlationId": "f6c2ae37-417c-4c08-9fb9-a13fe5c6797f"
}
```

| HTTP status | Code                       | Trigger                                          |
| ----------- | -------------------------- | ------------------------------------------------ |
| 400         | `IDEMPOTENCY_KEY_REQUIRED` | Create booking thiếu/rỗng key sau authentication |
| 401         | `UNAUTHORIZED`             | JWT thiếu, sai chữ ký/alg/claims hoặc hết hạn    |
| 403         | `FORBIDDEN`                | Role không được phép                             |
| 403         | `ORIGIN_NOT_ALLOWED`       | Refresh/logout thiếu hoặc sai Origin             |
| 404         | `ROUTE_NOT_FOUND`          | Method/path ngoài allowlist                      |
| 413         | `PAYLOAD_TOO_LARGE`        | Body vượt `MAX_REQUEST_BODY_BYTES`               |
| 429         | `RATE_LIMITED`             | Vượt rate limit; có Retry-After                  |
| 502         | `UPSTREAM_UNAVAILABLE`     | Không kết nối được backend                       |
| 504         | `UPSTREAM_TIMEOUT`         | Upstream inactivity timeout                      |
| 500         | `GATEWAY_ERROR`            | Lỗi nội bộ; không lộ chi tiết                    |

Backend error được chuyển nguyên trạng; backend owner phải bảo đảm schema V2.
Nếu response đã bắt đầu stream thì gateway đóng stream khi lỗi, không ghép JSON lỗi.

## Health

- `GET /api/health` → 200 `{"gateway":"ok"}`, đúng GatewayHealth V2.
- `GET /health/live` → 200 `{"status":"ok"}`.
- `GET /health/ready` → 200 `{"status":"ready"}` sau app init/config/public key hợp lệ.

Cả ba public, miễn rate limit, không probe backend. Service health nội bộ không tự
được expose qua gateway.

## Điều kiện đóng tích hợp thật

1. Auth ký token RS256 runtime đúng claims V2; public key thực tế khớp gateway/backend.
2. Backend phục vụ nguyên `/api`, port/DNS đúng env; không suy đoán từ fixture.
3. Test login/refresh/logout với cookie path/domain/expiry/SameSite/Secure đúng môi trường.
4. Chạy API qua gateway cho ba role, ownership, DTO/response/error đúng OpenAPI.
5. Access token còn hạn vẫn dùng ở service khi Auth tắt; sai JWT bị chặn cả ở backend.
6. E2E Booking 202 → Operations → projection/timeline/notification, concurrency,
   cancellation và Notification outage/recovery do các service owner cùng nghiệm thu.
