# Development

## Công cụ

Node.js 24 LTS >=24.15, npm, NestJS 12, TypeScript 6, Express adapter. Dùng phiên bản
Node 24 mới nhất để đáp ứng engine của Nest CLI. [Manifest](../package.json) và
[lockfile](../package-lock.json) ghim dependency; CI dùng `npm ci`.

TypeScript hiện giữ ở nhánh 6 do peer dependency của `typescript-eslint` chưa hỗ trợ
TypeScript 7. Override `minimatch` 11.0.1 vá GHSA-g3hv-75wg-m249 cho tooling;
đánh giá lại override khi nâng dependency gốc.

## Làm việc với NestJS

- `npm run dev` dùng Nest CLI compile/watch, không chạy source bằng native Node type stripping.
- Bật legacy decorators và `emitDecoratorMetadata` để DI hoạt động.
- ESM + NodeNext, source import tương đối bằng `.js`; TypeScript resolve tới `.ts`.
- Dùng `import type` cho Request/Response/config interface; import runtime cho injectable
  class dùng trong constructor. Nếu chỉ import type class DI sẽ thiếu metadata phù hợp.
- `main.ts` listen và shutdown; `createApplication()` trong [bootstrap](../src/bootstrap.ts)
  init app để test có thể listen cổng 0 và đóng sau test.
- Config được validate tập trung và inject qua `GATEWAY_CONFIG`, không đọc env rải rác.

## Thay đổi route/service

1. Đối chiếu API với [contract](api-contract.md).
2. Thêm method/path/target/access/role vào [routes](../src/modules/routing/routes.ts).
3. Nếu thêm service, cập nhật config type/schema, ProxyService target map, env mẫu,
   Compose local/production và docs.
4. Bổ sung test forward/method/auth/headers và kiểm tra endpoint nội bộ không bị lộ.
5. Không parse DTO nghiệp vụ trong proxy; nếu cần thay stream/body parser phải kiểm
   tra raw payload, multipart/cookie và content-length tương ứng.

## Kiểm tra

```sh
npm run format
npm run check
npm test
npm run build
```

Test được compile vào `.test-dist/` rồi chạy bằng Node test runner vì NestJS có
decorators. Fixture dựng 5 HTTP server ở `127.0.0.1` trên cổng ngẫu nhiên, sinh RSA
private key trong bộ nhớ và ghi public key vào thư mục tạm, dọn sau test. Test CLI
sinh key dùng file tạm để kiểm tra key khớp nhau và không bị ghi đè. Không dùng key Auth thật.

Test bao phủ config, toàn bộ route registry, stream body/query/header, JWT/role,
Origin/cookie, CORS, request ID, rate limit, business response pass-through,
Notification mất kết nối và timeout. Chúng kiểm tra gateway với fixture, không chứng
minh nghiệp vụ hay consumer/outbox của các service đã hoàn thiện.

## Chạy bản build

Sau khi có `.env` và public key khớp Auth:

```sh
npm run build
npm start
```

Lỗi JWT_PUBLIC_KEY_PATH: kiểm tra đường dẫn, quyền đọc và RSA SPKI PEM tối thiểu 2048 bit.
401: kiểm tra public key/RS256/issuer/audience/sub/role/exp với Auth owner. 403 có thể từ
role/Origin tại gateway hoặc ownership tại backend. 502/504: kiểm tra target từ bên
trong container. Dùng `x-request-id` để đối chiếu log, không in token/cookie/body/query.
