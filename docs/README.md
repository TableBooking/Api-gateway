# Tài liệu API Gateway

Tài liệu dành riêng cho repo gateway NestJS của hệ thống đặt bàn TableBooking.
Nguồn nghiệp vụ là kế hoạch NestJS V1 ngày 02/11/2026 do nhóm cung cấp. Thiết kế hiện
tại dùng NestJS làm gateway và JWT HS256 theo yêu cầu cập nhật của chủ repo.

| Tài liệu                            | Nội dung                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| [Architecture](architecture.md)     | Vai trò gateway, 5 service, module và luồng async Booking |
| [Proxy routing](proxy-routing.md)   | Method/path allowlist, targets, headers, stream, timeout  |
| [Authentication](authentication.md) | HS256, public/role policy, refresh cookie, ownership      |
| [Configuration](configuration.md)   | Schema env, local/Docker, secret và mạng service          |
| [API contract](api-contract.md)     | API expose, quyền, headers, lỗi và trách nhiệm service    |
| [Deployment](deployment.md)         | Docker, Compose, Docker Hub, CI, deploy/rollback          |
| [Development](development.md)       | Cấu trúc NestJS, DI, scripts và kiểm thử                  |

## Mức độ xác nhận

- **Theo kế hoạch:** 5 service, nhóm API, các role, refresh cookie, booking trả
  `202 QUEUED`, idempotency và ownership do service xử lý.
- **Theo yêu cầu cập nhật:** NestJS là gateway, dùng HS256 với JWT_SECRET phía backend.
- **Đã triển khai trong repo:** NestJS HTTP gateway, danh sách method/path, kiểm tra JWT/role,
  proxy stream, Origin check, rate limit, config validation và CI/Docker files.
- **Đề xuất cần chốt với backend owner:** tên claim `role`, giá trị issuer/audience,
  việc đồng bộ JWT_SECRET, cổng nội bộ/DNS và việc backend phục vụ cùng prefix `/api`.
- **Chưa xác nhận E2E:** schema response/DTO đầy đủ và luồng thật qua 5 backend,
  database, RabbitMQ, Notification outage/recovery. Test gateway dùng backend fixture.

Không dùng tài liệu này để thay OpenAPI hoặc đặc tả event của từng service. Khi
backend chốt hợp đồng, cập nhật gateway config, policy và integration test tương ứng.
