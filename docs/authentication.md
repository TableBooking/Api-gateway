# Authentication và authorization

## Phân chia trách nhiệm

Auth Service sở hữu đăng ký, đăng nhập, hash password, cấp access JWT HS256, refresh
sessions/rotation/logout và tạo tài khoản staff. NestJS Gateway xác minh access token
cục bộ bằng JWT_SECRET và kiểm tra role theo route; không gọi Auth mỗi request.

Theo thiết kế cập nhật, **các backend vẫn xác minh JWT bằng secret dùng chung** và tự kiểm tra role/
ownership. Qua được gateway không có nghĩa khách A được đọc/hủy booking của khách B.
Không truy cập bảng `users`/`refresh_sessions` từ gateway. JWT_SECRET chỉ chia sẻ cho
các backend tin cậy có trách nhiệm xác minh access token, tuyệt đối không gửi cho React.

## JWT contract đề xuất cần chốt

Theo yêu cầu cập nhật, gateway chỉ chấp nhận **HS256**. Payload/issuer/audience của
Auth thật chưa được cung cấp; verifier hiện sử dụng hợp đồng đề xuất sau:

```json
{
  "sub": "user-uuid",
  "role": "CUSTOMER",
  "iss": "tablebooking-auth",
  "aud": "tablebooking-api",
  "exp": 1790000000
}
```

`exp` trên chỉ minh họa Unix timestamp, không phải token có thể dùng. Header JWT
phải có `alg: HS256`. `sub`, `exp`, `role` là bắt buộc; issuer/audience phải khớp env.
Nếu có `nbf`, verifier cũng kiểm tra. Role chỉ nhận `CUSTOMER`, `STAFF`, `MANAGER`.
Hiện dùng một claim `role`, không tự nhận `roles` array hoặc claim khác.

Client gửi `Authorization: Bearer <accessToken>`. Thiếu, hết hạn, sai chữ ký,
algorithm khác HS256, sai issuer/audience hoặc role không hợp lệ đều trả 401;
token hợp lệ nhưng sai quyền route trả 403. Response không tiết lộ chi tiết verify.
Không truyền access token qua query string. JWT được ký không có nghĩa payload
được mã hóa; không đặt password hoặc secret trong claims.

## Access policy

| API                                         | Policy gateway                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Register/login                              | Public; rate limit chặt hơn                                                       |
| Refresh/logout                              | Không yêu cầu access JWT; bắt buộc Origin được phép, Auth xác minh refresh cookie |
| Users/me, bookings, tracking, notifications | Access JWT hợp lệ                                                                 |
| Users/staff                                 | MANAGER                                                                           |
| Đọc tables/reservations, action reservation | STAFF hoặc MANAGER                                                                |
| Tạo/sửa table                               | MANAGER                                                                           |
| Health                                      | Public, miễn rate limit                                                           |

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

## JWT_SECRET và rotation

- `JWT_SECRET` là bắt buộc, không có default. Gateway từ chối secret dưới 32 byte
  UTF-8, chỉ chứa khoảng trắng hoặc còn placeholder `replace-with-...`.
- Sinh secret từ ít nhất 32 byte ngẫu nhiên, không dùng password dễ đoán. HS256 cần
  key tối thiểu 256 bit theo [RFC 7518, mục 3.2](https://www.rfc-editor.org/rfc/rfc7518.html#section-3.2).
- Gateway và Auth dùng cùng chuỗi secret theo UTF-8; không tự giải mã hex/base64.
  Với lệnh dưới, dùng nguyên chuỗi hex sinh ra ở tất cả backend:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

- Đặt secret trong env backend/secret manager. Không commit `.env`, không đưa vào
  `VITE_*`, React, JWT payload, Dockerfile, build args hoặc log.
- HS256 dùng secret đối xứng: bất kỳ service nào có secret cũng có khả năng ký token.
  Chỉ cấp secret cho backend tin cậy; kiểm tra role/ownership vẫn là bắt buộc.
- Chưa có multiple-secret rotation hoặc hot reload. Đổi secret phải cập nhật Auth,
  gateway và các backend liên quan rồi restart, phối hợp TTL token cũ.
- Access JWT được verify offline nên logout/revoke refresh session không lập tức
  vô hiệu access JWT đã cấp. TTL và nhu cầu revoke sớm phải do Auth/system contract quyết định.

## Trust boundary

Giữ `TRUST_PROXY=false` khi gateway nhận traffic trực tiếp. Chỉ bật khi tất cả traffic
đi qua proxy tin cậy ghi đè forwarded headers và gateway không bị truy cập trực tiếp.
Nếu không, IP rate limit và protocol nhận diện từ headers có thể bị giả mạo.
Backend nên nằm trong mạng riêng và luôn tự verify token, không tin header identity.
