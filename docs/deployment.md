# Deployment và Docker Hub

## Điều kiện tích hợp

Gateway image không chứa 5 backend, PostgreSQL hoặc RabbitMQ. Các service thuộc repo
platform và phải truy cập được từ container gateway. Dùng public key khớp private
key của Auth; không đưa private key vào gateway hoặc image. Docker Engine/Desktop
và Compose v2 phải đang chạy.

## Build local và gọi backend chạy trên host

Copy [.env.docker.example](../.env.docker.example) thành `.env.docker`, sửa các target
thành `http://host.docker.internal:3001` ... `:3005` nếu backend đang chạy trên host.
Đặt JWT_PUBLIC_KEY_FILE về file public key thật, kiểm tra issuer/audience khớp Auth.
Nếu chưa có key, xem lệnh sinh key trong [authentication](authentication.md). Sau đó:

```sh
docker compose --env-file .env.docker up --build -d
curl --fail http://localhost:8080/health/ready
docker compose --env-file .env.docker logs --tail=100 gateway
```

Compose local có alias `host.docker.internal:host-gateway`; backend phải listen trên
interface host mà container truy cập được. Nếu chọn target DNS `auth`, `booking`, ...
thì gateway và backend cần ở network chung. Không dùng localhost cho service khác.

[Dockerfile](../Dockerfile) build bằng Nest CLI, runtime chỉ chứa `dist/`, production
dependencies và manifest. Chạy user `node`, HTTP port 8080, health check liveness.
Public key chỉ mount read-only lúc chạy. Compose bật init, read-only filesystem,
drop capabilities, log rotation và shutdown grace period 15 giây.

## GitHub CI

[CI workflow](../.github/workflows/ci.yml) chạy trên PR/main và được tái sử dụng khi
publish: `npm ci` → check → test → Nest build → Docker build và health smoke test.
Container smoke test dùng RSA public key tạm do CI tạo; không cần credential Auth thật.

## Cấu hình Docker Hub

1. Tạo Docker Hub repository `api-gateway` trong namespace tài khoản phát hành.
2. Tạo Personal Access Token có quyền push.
3. Trong GitHub **Settings → Secrets and variables → Actions**, tạo secrets:
   - `DOCKERHUB_USERNAME`: username Docker Hub viết thường.
   - `DOCKERHUB_TOKEN`: access token, không dùng mật khẩu trong source.
4. Nếu repository khác `api-gateway`, tạo variable `DOCKERHUB_REPOSITORY` (không gồm username).

Nếu namespace là organization khác username login, sửa trường `images` ở
[publish workflow](../.github/workflows/docker-publish.yml) theo namespace thực tế.

Push source đã commit lên GitHub và tag bản đầu:

```sh
git push origin main
git tag v0.1.0
git push origin v0.1.0
```

Publish chỉ chạy sau CI thành công, build `linux/amd64` + `linux/arm64`. Tag `v0.1.0`
sinh image tags `0.1.0`, `0.1`, `latest`, `sha-<full-commit-sha>`. SemVer prerelease
không cập nhật latest. Chạy **Publish to Docker Hub → Run workflow** trên branch
chỉ sinh tag SHA; không tự tạo version release. Image có provenance/SBOM.

## Deploy production bằng image

Dùng [compose.prod.yaml](../compose.prod.yaml) độc lập: chỉ có `image`, không có
build context; server không cần source. Copy file này, public key và `.env.docker`
đã cấu hình lên server. Ví dụ `.env.docker`:

```dotenv
GATEWAY_IMAGE=your-username/api-gateway:0.1.0
BIND_ADDRESS=127.0.0.1
PORT=8080
CORS_ORIGINS=https://app.example.com
TRUST_PROXY=false
AUTH_SERVICE_URL=http://auth:3001
BOOKING_SERVICE_URL=http://booking:3002
OPERATIONS_SERVICE_URL=http://operations:3003
TRACKING_SERVICE_URL=http://tracking:3004
NOTIFICATION_SERVICE_URL=http://notification:3005
JWT_PUBLIC_KEY_FILE=./keys/auth-public.pem
JWT_ISSUER=restaurant-auth
JWT_AUDIENCE=restaurant-api
PLATFORM_NETWORK=tablebooking-platform
```

Các URL và JWT values là ví dụ cần khớp platform thật. Repo platform phải tạo một
network có tên tương ứng và nối 5 backend vào network đó với DNS alias đúng. Nếu
network chưa có, tạo một lần bằng `docker network create tablebooking-platform`
rồi cấu hình platform sử dụng network đó; tạo network riêng không tự nối backend.
Nếu private image, login Docker Hub trên server bằng token pull trước bước tiếp theo.

```sh
docker compose --env-file .env.docker -f compose.prod.yaml config --quiet
docker compose --env-file .env.docker -f compose.prod.yaml pull gateway
docker compose --env-file .env.docker -f compose.prod.yaml up -d gateway
curl --fail http://127.0.0.1:8080/health/ready
docker compose --env-file .env.docker -f compose.prod.yaml logs --tail=100 gateway
```

NestJS trực tiếp làm gateway; thiết kế này không thêm một gateway khác. Cấu hình
hiện tại dùng HTTP, chưa tự cấp certificate hoặc phục vụ HTTPS. Khi triển khai public,
cần cấu hình TLS phù hợp môi trường hoặc bổ sung HTTPS cho NestJS trước khi dùng
cookie Secure. Mặc định chỉ bind loopback; nếu cần mở port, đặt BIND_ADDRESS theo
topology và giới hạn truy cập backend ở mạng riêng. Giữ TRUST_PROXY=false khi
client gọi thẳng NestJS. Xem [authentication](authentication.md).

## Smoke test sau deploy

Health pass chỉ xác nhận gateway/config, không xác nhận backend. Cần kiểm tra
login với Auth, users/me bằng JWT, một API đọc Operations với STAFF/MANAGER và
POST Booking có Idempotency-Key trả 202. Kiểm tra refresh cookie bằng Origin thật.
Acceptance test Notification down/up, idempotency, ownership và concurrency cần chạy
trong platform; không suy ra từ health hoặc mock test gateway.

## Rollback và giới hạn

Ghi lại image tag/digest hiện tại trước deploy. Khi lỗi, đổi `GATEWAY_IMAGE` về bản
trước và chạy lại pull/up. Ưu tiên `version` hoặc `image@sha256:<digest>` thay latest.
Không đổi/rollback public key mà không phối hợp Auth/backend/token TTL.

Compose một replica có thể gián đoạn ngắn khi thay container. CI tự kiểm tra/publish
image; server deploy hiện thực hiện bằng các lệnh trên, chưa có SSH auto-deploy.
Rate limit đang in-memory, chưa chia sẻ giữa replica; proxy chưa có upload size limit
hoặc total streaming deadline, cần bổ sung tại gateway theo nhu cầu.
