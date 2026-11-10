# Authentication và authorization

## Phân chia trách nhiệm

Auth Service sở hữu đăng ký, đăng nhập, hash password, cấp access JWT RS256, refresh
sessions/rotation/logout và tạo tài khoản staff. Auth ký bằng RSA private key;
NestJS Gateway xác minh token bằng public key và kiểm tra role, không gọi Auth mỗi request.

Theo thiết kế cập nhật, **các backend vẫn xác minh JWT bằng public key** và tự kiểm tra role/
ownership. Qua được gateway không có nghĩa khách A được đọc/hủy booking của khách B.
Không truy cập bảng `users`/`refresh_sessions` từ gateway. Chỉ Auth giữ private key;
public key có thể phân phối tới gateway/backend để verify, không cho phép ký token.

## JWT contract V2

Theo [bàn giao V2](https://github.com/TableBooking/docs/blob/82444c44a2bebbbe077e2cb9969a70f3a0ce026b/restaurant-nestjs-playbook-team/shared/07-BAN-GIAO-GIUA-CAC-NGUOI.md),
gateway chỉ chấp nhận **RS256**, mặc định issuer/audience như dưới đây. Đây là contract
mục tiêu; token/public key từ Auth thật vẫn cần kiểm chứng tích hợp.

```json
{
  "sub": "f6c2ae37-417c-4c08-9fb9-a13fe5c6797f",
  "email": "customer@example.test",
  "role": "CUSTOMER",
  "iss": "restaurant-auth",
  "aud": "restaurant-api",
  "iat": 1793970000,
  "exp": 1793970900
}
```

`exp` trên chỉ minh họa Unix timestamp, không phải token có thể dùng. Header JWT
phải có `alg: RS256`. `sub` phải là UUID; `sub`, `exp`, `role` là bắt buộc;
issuer/audience phải khớp env. Auth phát `email`/`iat` theo bàn giao; gateway không dùng
hai claim này cho route policy nên không bắt buộc chúng. Backend kiểm tra claim mình cần.
Nếu có `nbf`, verifier cũng kiểm tra. Role chỉ nhận `CUSTOMER`, `STAFF`, `MANAGER`.
Hiện dùng một claim `role`, không tự nhận `roles` array hoặc claim khác.

Client gửi `Authorization: Bearer <accessToken>`. Thiếu, hết hạn, sai chữ ký,
algorithm khác RS256, sai issuer/audience hoặc role không hợp lệ đều trả 401;
token hợp lệ nhưng sai quyền route trả 403. Response không tiết lộ chi tiết verify.
Không truyền access token qua query string. JWT được ký không có nghĩa payload
được mã hóa; không đặt password hoặc secret trong claims.

## Access policy

| API                                               | Policy gateway                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Register/login                                    | Public; rate limit chặt hơn                                                       |
| GET restaurant current/areas, slots, availability | Public theo OpenAPI V2; chuyển tới Operations                                     |
| Refresh/logout                                    | Không yêu cầu access JWT; bắt buộc Origin được phép, Auth xác minh refresh cookie |
| Users/me, bookings, tracking, notifications       | Access JWT hợp lệ                                                                 |
| Users/staff                                       | MANAGER                                                                           |
| PATCH users/{id}/status                           | MANAGER                                                                           |
| Change-password, PATCH users/me                   | Access JWT hợp lệ                                                                 |
| Đọc tables/reservations, action reservation       | STAFF hoặc MANAGER                                                                |
| Tạo/sửa table                                     | MANAGER                                                                           |
| Đọc areas/slot-configs                            | STAFF hoặc MANAGER                                                                |
| Tạo/sửa areas/slot-configs, stats/summary         | MANAGER                                                                           |
| Health                                            | Public, miễn rate limit                                                           |

Gateway không tự nâng quyền MANAGER thành mọi role bằng kế thừa; danh sách role của
mỗi route liệt kê tường minh. API cần ownership vẫn được service kiểm tra theo `sub`.
Role đăng ký luôn là CUSTOMER do Auth ép; gateway không sửa body register.

## Refresh cookie và Origin

Login/refresh response được chuyển tiếp với toàn bộ `Set-Cookie`; FE dùng
`credentials: 'include'` khi cần cookie. Gateway bật CORS credentials với allowlist
origin cụ thể, không dùng `*`.

Với `POST /api/auth/refresh` và `/logout`, gateway bắt buộc header `Origin` khớp một
giá trị trong `CORS_ORIGINS`, kể cả khi gọi bằng curl. Đây là policy bổ sung tại
gateway cho cookie endpoints, không phải yêu cầu bearer token. Auth quyết định
refresh cookie hợp lệ/hết hạn/đã revoke và thực hiện rotation, không phải gateway.

Auth owner cần chốt tên cookie, expiry và SameSite. Cookie nên HttpOnly, Secure khi
HTTPS và Path phù hợp (`/api/auth` là đề xuất). Nếu FE/API khác site và dùng
`SameSite=None`, bắt buộc Secure; chính sách CSRF của Auth cần đánh giá theo topology
thực tế. Origin check tại gateway là một lớp bảo vệ, không thay Auth session logic.

```sh
curl -i -X POST http://localhost:8080/api/auth/refresh \
  -H 'Origin: http://localhost:5173' \
  --cookie cookies.txt --cookie-jar cookies.txt
```

## Sinh key và chọn issuer/audience

Ba cấu hình cũ không phải ba secret cần sinh. Khi dùng RS256:

| Cấu hình        | Lấy ở đâu?                                         | Ai sử dụng?                              |
| --------------- | -------------------------------------------------- | ---------------------------------------- |
| `JWT_SECRET`    | Bỏ khỏi env; không dùng cho RS256                  | Không dùng                               |
| RSA private key | Sinh ngẫu nhiên một lần cho hệ thống               | Chỉ Auth ký token                        |
| RSA public key  | Sinh cùng cặp private key hoặc lấy từ Auth hiện có | Gateway và các backend verify            |
| `JWT_ISSUER`    | Bàn giao V2: `restaurant-auth`                     | Auth ghi `iss`, gateway/backend kiểm tra |
| `JWT_AUDIENCE`  | Bàn giao V2: `restaurant-api`                      | Auth ghi `aud`, gateway/backend kiểm tra |

Issuer/audience không cần random, không phải password hoặc URL bắt buộc phải truy cập
được; tên phải khớp chính xác giữa bên phát và bên kiểm tra. Ý nghĩa hai claims theo
[RFC 7519, mục 4.1.1 và 4.1.3](https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1.1).
Với token dùng chung cho các API TableBooking, có thể giữ nguyên hai tên mẫu trên.

**Nếu Auth đã có cặp RSA:** lấy public key hiện có, không sinh một cặp độc lập cho
gateway; token sẽ không verify được nếu key không cùng cặp.

**Nếu chưa có cặp key:** tại root repo, chạy trên PowerShell hoặc shell thông thường:

```sh
npm run keys:generate
```

[Script](../scripts/generate-jwt-keys.mjs) sinh RSA 3072 bit:

- `keys/auth-private.pem`: PKCS#8 PEM, chuyển vào nơi lưu key riêng của Auth.
- `keys/auth-public.pem`: SPKI PEM, giữ/copy vào gateway và các backend cần verify.
- Chỉ in đường dẫn file, không in nội dung key; từ chối ghi đè nếu một trong hai file tồn tại.
- Có thể chọn thư mục khác bằng `npm run keys:generate -- <output-directory>`.
- Chạy provisioning một lần, không chạy mỗi khi app startup hoặc mỗi lần deploy.
  Thư mục `keys/` ở repo này bị gitignore/dockerignore; thư mục tùy chọn cần tự bảo vệ.

Gateway `.env`:

```dotenv
JWT_PUBLIC_KEY_PATH=./keys/auth-public.pem
JWT_ISSUER=restaurant-auth
JWT_AUDIENCE=restaurant-api
```

Phía Auth cấu hình tương ứng (tên biến private key là gợi ý cho repo Auth):

```dotenv
JWT_PRIVATE_KEY_PATH=./keys/auth-private.pem
JWT_ISSUER=restaurant-auth
JWT_AUDIENCE=restaurant-api
```

Auth phải ký với `algorithm: RS256`, phát `iss`, `aud`, `sub`, `role`, `exp` đúng
hợp đồng. Gateway không đọc biến JWT_PRIVATE_KEY_PATH. Nếu Auth đã dùng issuer/
audience khác, đổi env gateway theo Auth thay vì tự sinh giá trị mới.

## Public key và rotation

- Public key được phép công khai; private key cần giữ kín. Không đưa private key
  vào React, JWT payload, gateway container, Dockerfile, build args, Git hoặc log.
- Gateway chỉ đọc RSA SPKI PEM tối thiểu 2048 bit lúc startup; sai/thiếu key thì
  từ chối khởi động. Docker mount public key read-only, không COPY key vào image.
- Script tạo private key PEM chưa mã hóa, đặt mode 0600 trên hệ điều hành hỗ trợ.
  Khi deploy, lưu tại Auth bằng secret manager/quyền file hoặc ACL phù hợp; trên
  Windows cần bảo vệ bằng ACL, không xem Unix mode là thay thế quyền Windows.
- Chưa có JWKS/multiple-key rotation hoặc hot reload. Đổi key phải cập nhật Auth,
  gateway và các backend liên quan rồi restart, phối hợp TTL token cũ.
- Access JWT được verify offline nên logout/revoke refresh session không lập tức
  vô hiệu access JWT đã cấp. TTL và nhu cầu revoke sớm phải do Auth/system contract quyết định.

## Trust boundary

Giữ `TRUST_PROXY=false` khi gateway nhận traffic trực tiếp. Chỉ bật khi tất cả traffic
đi qua proxy tin cậy ghi đè forwarded headers và gateway không bị truy cập trực tiếp.
Nếu không, IP rate limit và protocol nhận diện từ headers có thể bị giả mạo.
Backend nên nằm trong mạng riêng và luôn tự verify token, không tin header identity.
