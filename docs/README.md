# Tài liệu API Gateway

Tài liệu dành riêng cho repo gateway NestJS của hệ thống đặt bàn TableBooking.
Nguồn nghiệp vụ là [OpenAPI và playbook V2](https://github.com/TableBooking/docs/tree/82444c44a2bebbbe077e2cb9969a70f3a0ce026b/restaurant-nestjs-playbook-team).
NestJS là gateway duy nhất theo yêu cầu chủ repo; không triển khai Nginx gateway V1 trong repo này.

| Tài liệu                            | Nội dung                                                          |
| ----------------------------------- | ----------------------------------------------------------------- |
| [Architecture](architecture.md)     | Vai trò gateway, 5 service, module và luồng async Booking         |
| [Proxy routing](proxy-routing.md)   | Method/path allowlist, targets, headers, stream, timeout          |
| [Authentication](authentication.md) | RS256, sinh key, issuer/audience, role, refresh cookie, ownership |
| [Configuration](configuration.md)   | Schema env, local/Docker, public key và mạng service              |
| [API contract](api-contract.md)     | API expose, quyền, headers, lỗi và trách nhiệm service            |
| [Deployment](deployment.md)         | Docker, Compose, Docker Hub, CI, deploy/rollback                  |
| [Development](development.md)       | Cấu trúc NestJS, DI, scripts và kiểm thử                          |

## Mức độ xác nhận

- **Theo V2:** 5 service, 41 operation, các role, refresh cookie, booking trả
  `202 QUEUED`, idempotency và ownership do service xử lý.
- **Theo yêu cầu cập nhật:** NestJS là gateway, dùng RS256; private key ở Auth, public key ở gateway.
- **Đã triển khai trong repo:** đủ routing 41 operation V2, kiểm tra JWT/role,
  proxy stream, Origin check, rate/body limit, lỗi correlationId, config validation và CI/Docker files.
- **Cần xác nhận với backend owner:** public key Auth thật, token đúng `sub` UUID/`role`,
  issuer/audience V2, cổng nội bộ/DNS, prefix `/api` và response DTO V2 thực tế.
- **Chưa xác nhận E2E:** schema response/DTO đầy đủ và luồng thật qua 5 backend,
  database, RabbitMQ, Notification outage/recovery. Test gateway dùng backend fixture.

Không dùng tài liệu này để thay OpenAPI hoặc đặc tả event của từng service. Khi
backend chốt hợp đồng, cập nhật gateway config, policy và integration test tương ứng.
