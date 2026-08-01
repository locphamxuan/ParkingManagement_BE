# PBMS Backend — Tài liệu chức năng nghiệp vụ

Tài liệu này trả lời hai câu hỏi:

1. **"Code chạy như thế nào?"** — Phần 1, 2, 3: cú pháp, vòng đời một request, kết nối database.
2. **"Nghiệp vụ X nằm ở đâu trong code?"** — Phần 4 trở đi.

Nếu bạn mới đọc codebase này lần đầu, **đọc tuần tự Phần 1 → 2 → 3**. Ba phần đó dạy
đủ để hiểu bất kỳ file nào trong `src/`. Phần sau là tra cứu, không cần đọc thẳng hàng.

Phạm vi: **chỉ Backend** (`ParkingManagement_BE`). Frontend không nằm trong tài liệu này.

> **Về số dòng.** Số dòng là chỉ dẫn nhanh, sẽ trôi khi code thay đổi. **Tên hàm mới là
> mỏ neo thật.** Không tìm thấy ở dòng đã ghi thì tra bằng tên hàm:
> `grep -rn "const tenHam" src/`. Tài liệu này nằm trong repo BE chính vì lý do đó —
> sửa code thì sửa luôn tài liệu trong cùng một commit.
>
> **Nguồn và bản xuất.** File Markdown `docs/NGHIEP_VU_BACKEND.md` trong repo BE là
> **nguồn sự thật**. File Word `docs/PBMS_Tai_Lieu_Nghiep_Vu_Backend.docx` ở thư mục
> gốc là **bản xuất** sinh ra từ nó. Sửa tài liệu thì sửa file `.md` rồi chạy lại script
> xuất — không sửa thẳng vào `.docx`, nếu không hai bản sẽ trôi lệch nhau.
>
> Chốt tại: `main` — 01/08/2026.

---

## Phần 1 — Nền tảng kỹ thuật: đọc hiểu code

Phần này giải thích **cú pháp và cơ chế** xuất hiện dày đặc trong codebase. Không nắm
phần này thì đọc file service nào cũng thấy `async`, `await`, `next()` mà không biết
chúng làm gì.

### 1.1 Node.js chạy một luồng — vì sao phải bất đồng bộ

Node.js chạy JavaScript trên **một luồng duy nhất** (single thread). Nghĩa là tại một
thời điểm chỉ có đúng một dòng code đang chạy.

Một truy vấn database mất khoảng 10–50ms. Trong 10ms đó CPU **không làm gì cả**, chỉ
ngồi chờ mạng trả lời. Nếu Node chờ theo kiểu chặn luồng (blocking), thì trong lúc chờ
truy vấn của người dùng A, **toàn bộ** người dùng B, C, D đều bị treo — server chỉ phục
vụ được vài request mỗi giây.

Giải pháp: khi gặp việc phải chờ (đọc DB, gọi API ngoài, đọc file), Node **giao việc đó
ra ngoài** rồi quay lại chạy code khác. Khi việc kia xong, nó mới quay lại xử lý tiếp.
Cơ chế điều phối này gọi là **event loop**.

Đây chính là lý do gần như mọi hàm trong `src/services/` đều là `async`.

### 1.2 Promise — "lời hứa sẽ có kết quả"

`Promise` là một đối tượng đại diện cho **một giá trị chưa có ngay bây giờ, nhưng sẽ có
sau**. Nó có đúng 3 trạng thái:

| Trạng thái | Nghĩa |
|---|---|
| `pending` | Đang chờ, chưa xong |
| `fulfilled` | Xong, có kết quả |
| `rejected` | Hỏng, có lỗi |

Một Promise chỉ chuyển trạng thái **đúng một lần** và không quay lại được.

```js
// Hàm này KHÔNG trả về User. Nó trả về một Promise sẽ chứa User.
User.findById(id)        // → Promise<User>
```

Viết theo lối cũ (`.then`) thì lồng nhau rất sâu, khó đọc:

```js
User.findById(id)
  .then((user) => Vehicle.find({ owner: user._id })
    .then((vehicles) => ParkingSession.find({ user: user._id })
      .then((sessions) => { /* ...lồng mãi... */ })));
```

### 1.3 `async` / `await` — viết bất đồng bộ mà đọc như tuần tự

`async` và `await` là **cú pháp đường** (syntactic sugar) viết đè lên Promise. Cùng logic
trên, viết lại:

```js
const user = await User.findById(id);
const vehicles = await Vehicle.find({ owner: user._id });
const sessions = await ParkingSession.find({ user: user._id });
```

Hai từ khoá, hai vai trò tách bạch:

- **`async`** đặt trước hàm → hàm đó **luôn** trả về một Promise, dù bên trong `return`
  giá trị thường. Và chỉ trong hàm `async` mới được dùng `await`.
- **`await`** đặt trước một Promise → **tạm dừng riêng hàm này** cho tới khi Promise xong,
  rồi lấy giá trị bên trong ra.

**Điểm quan trọng nhất, hay bị hiểu sai:** `await` **không** làm đứng cả server. Nó chỉ
tạm dừng *hàm đang chạy*. Trong lúc hàm A đứng chờ DB, event loop rảnh tay đi chạy request
của người dùng B. Đây là lý do một server Node một luồng vẫn phục vụ được hàng nghìn
người cùng lúc.

**Quên `await` là lỗi im lặng và nguy hiểm nhất** với người mới:

```js
const user = User.findById(id);   // SAI — user là Promise, không phải User
console.log(user.email);          // undefined, không báo lỗi gì cả
```

**Bắt lỗi**: Promise bị `reject` sẽ biến thành `throw` bình thường, nên dùng `try/catch`
như code đồng bộ:

```js
try {
  await transporter.sendMail(...);
} catch (err) {
  // SMTP hỏng — xem services/auth.service.js, hàm requestRegistration
}
```

**Chạy song song khi các việc không phụ thuộc nhau.** `await` liên tiếp là chạy *lần
lượt*: 3 truy vấn × 30ms = 90ms. Nếu chúng độc lập, dùng `Promise.all` để chạy **cùng
lúc**, chỉ tốn ~30ms. Ví dụ thật trong `src/services/user/incident.service.js`, hàm
`listMyIncidents`:

```js
const [items, total] = await Promise.all([
  Incident.find(filter)...,
  Incident.countDocuments(filter),
]);
```

Lấy danh sách và đếm tổng không cần chờ nhau → gộp lại một nhịp.

### 1.4 Module — `require` và `module.exports`

Backend này dùng **CommonJS** (chuẩn module gốc của Node), không phải `import/export`
của ES Module.

```js
// Xuất ra cho file khác dùng
module.exports = { create, update };          // xuất nhiều thứ
module.exports = mongoose.model('Payment', s); // xuất đúng một thứ

// Nhập vào
const service = require('../../services/user/vehicle.service');
const { create } = require('../../services/user/vehicle.service'); // bóc luôn
```

Đường dẫn bắt đầu bằng `./` hoặc `../` là **file trong dự án**; không có dấu chấm là
**thư viện** trong `node_modules` (`require('express')`).

Node **nhớ (cache) module sau lần `require` đầu tiên**. Nên `require('./config/env')` ở
20 file khác nhau vẫn chỉ đọc file `.env` đúng một lần, và tất cả cùng dùng chung một
đối tượng. Đây là cách project đảm bảo cấu hình là một nguồn duy nhất.

### 1.5 Middleware và `next()` — dây chuyền xử lý của Express

Express xử lý request theo kiểu **dây chuyền**: request đi qua lần lượt từng chặng, mỗi
chặng là một hàm gọi là **middleware**.

Middleware là hàm nhận **3 tham số**:

```js
(req, res, next) => { ... }
```

| Tham số | Là gì |
|---|---|
| `req` | Yêu cầu từ client: `req.body`, `req.params`, `req.query`, `req.headers`, `req.cookies` |
| `res` | Nơi ghi câu trả lời: `res.status(200).json({...})` |
| `next` | **Hàm** để chuyển sang chặng kế tiếp |

Mỗi middleware có đúng **ba** lựa chọn, và phải chọn một:

1. Gọi `next()` → đi tiếp chặng sau.
2. Trả lời luôn (`res.json(...)`) → **dừng dây chuyền**, các chặng sau không chạy.
3. Gọi `next(err)` → **nhảy thẳng** tới middleware xử lý lỗi, bỏ qua mọi chặng ở giữa.

Quên làm cả ba thì request **treo vĩnh viễn** cho tới khi client tự bỏ cuộc.

Ví dụ thật — `src/middlewares/auth.middleware.js`, hàm `authenticate`: đọc token từ
cookie, không có token thì `throw` (thành `next(err)`), có token hợp lệ thì gắn
`req.user = user` rồi `next()`. Nhờ vậy **mọi** chặng phía sau đều dùng được `req.user`
mà không phải tự giải mã token lại.

**Middleware xử lý lỗi khác ở chỗ có 4 tham số** — Express nhận diện bằng số lượng tham
số, không phải bằng tên:

```js
const errorHandler = (err, req, res, _next) => { ... }  // 4 tham số → handler lỗi
```

### 1.6 `asyncHandler` — mảnh code nhỏ nhất nhưng quan trọng nhất

Express (bản 4) **không tự bắt lỗi trong hàm `async`**. Viết thế này là hỏng:

```js
router.post('/', async (req, res) => {
  const data = await service.create(req.body);   // nếu ném lỗi ở đây...
  res.json(data);
});
// ...Promise bị reject mà không ai bắt → request treo, client chờ tới timeout
```

Cách vá thủ công là bọc `try/catch` ở **mọi** controller — lặp lại hàng trăm lần. Project
giải quyết bằng một hàm 3 dòng, `src/utils/asyncHandler.js`:

```js
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

Đọc từ trong ra:

1. `asyncHandler` nhận vào hàm `fn` (chính là controller của bạn).
2. Nó **trả về một hàm mới** đúng dạng middleware `(req, res, next)` — kỹ thuật này gọi là
   **higher-order function**: hàm nhận hàm, trả về hàm.
3. `Promise.resolve(...)` bọc kết quả để chắc chắn có `.catch` dùng được.
4. `.catch(next)` — lỗi bất kỳ sẽ được đưa thẳng vào `next(err)`, tức nhảy tới
   `errorHandler`.

Nhờ đó controller viết sạch, **không có `try/catch` nào**:

```js
const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user, req.body);
  sendSuccess(res, { data });
});
```

**Luật của project: controller không được viết `try/catch`.** Cứ `throw new AppError(...)`
ở tầng service, lỗi tự chảy về một chỗ xử lý duy nhất.

### 1.7 `AppError` — phân biệt lỗi nghiệp vụ và lỗi hệ thống

`src/utils/AppError.js` là một class kế thừa `Error`, thêm 3 thứ:

```js
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;   // mã HTTP trả về: 400, 403, 409...
    this.errorCode = errorCode;     // mã máy đọc được: 'SLOT_NOT_AVAILABLE'
    this.isOperational = true;      // ĐÁNH DẤU: đây là lỗi nghiệp vụ đã lường trước
  }
}
```

`isOperational` là điểm mấu chốt. Nó chia lỗi làm hai loại:

| Loại | Ví dụ | Cách đối xử |
|---|---|---|
| **Nghiệp vụ** (`AppError`) | "Ô đỗ đã có người", "Số dư không đủ" | Trả nguyên văn cho client — người dùng cần đọc được |
| **Hệ thống** (lỗi thường) | Mất kết nối DB, SMTP chết, lỗi lập trình | **Che đi** ở production, chỉ ghi log |

Vì sao phải che? Lỗi hệ thống mang chi tiết hạ tầng. Chính lỗi đăng ký ngày 01/08/2026
từng trả thẳng ra ngoài chuỗi `connect ENETUNREACH 2607:f8b0:4023:2c03::6d:587` — lộ cả
địa chỉ IP máy chủ mail cho bất kỳ ai gọi API. Xem `src/middlewares/error.middleware.js`.

**Vì sao dùng cả `errorCode` chứ không chỉ `message`?** `message` là để **người** đọc và
có thể đổi lời văn bất cứ lúc nào. `errorCode` là để **máy** đọc — frontend bắt
`SLOT_NOT_AVAILABLE` để hiện đúng màn hình, và test viết
`rejects.toMatchObject({ errorCode: 'ACTIVE_SESSION_REQUIRED' })`. Nếu frontend phải so
sánh chuỗi tiếng Việt thì chỉ cần sửa một dấu phẩy là hỏng.

---

## Phần 2 — Vòng đời một request, đi từng bước

Phần này bám theo **một** request thật từ lúc rời trình duyệt tới lúc có câu trả lời.
Chọn ví dụ: **người dùng báo cáo sự cố**.

```
POST /api/users/incidents
Cookie: pbms_token=eyJhbGciOi...
Content-Type: application/json

{ "type": "slot_occupied", "note": "Có xe đậu vào chỗ tôi", "violatorPlate": "51F-999.99" }
```

### 2.1 Sơ đồ tổng thể

```
Trình duyệt
   │
   ▼
app.js — dây chuyền middleware toàn cục (chạy cho MỌI request)
   │  ① header bảo mật      ② nén gzip        ③ đọc cookie
   │  ④ chặn CSRF           ⑤ CORS            ⑥ đọc JSON body
   │  ⑦ lọc ký tự độc
   ▼
routes/index.js  →  routes/user/index.js  →  routes/user/incident.routes.js
   │  khớp URL + gắn middleware riêng của tuyến (authenticate, RBAC, rate limit)
   ▼
controllers/user/incident.controller.js   — bóc req, gọi service, KHÔNG chạm DB
   ▼
services/user/incident.service.js         — toàn bộ luật nghiệp vụ, KHÔNG biết req/res
   ▼
models/log/Incident.js  →  Mongoose  →  MongoDB Atlas
   │
   ▼
res.json(...)  ← sendSuccess()          hoặc  errorHandler  ← throw AppError
```

### 2.2 Chặng 1 — middleware toàn cục (`src/app.js`)

Thứ tự trong `app.js` **không phải ngẫu nhiên**, đổi chỗ là sinh lỗ hổng:

| Thứ tự | Middleware | Việc | Vì sao ở vị trí này |
|---|---|---|---|
| 1 | Header bảo mật | `X-Frame-Options`, `nosniff`… | Phải áp cho mọi phản hồi, kể cả lỗi |
| 2 | `compression` | Nén phản hồi > 1KB | — |
| 3 | `cookieParser` | Đọc `Cookie:` → `req.cookies` | Phải trước chặn CSRF vì CSRF cần biết có cookie không |
| 4 | `enforceCsrfOrigin` | Chặn ghi từ web lạ | **Trước** CORS — CORS là chuyện vận chuyển, đổi config CORS không được âm thầm mở lại lỗ này |
| 5 | `cors` | Danh sách origin được phép | Bắt buộc `credentials: true` để cookie đi kèm được |
| 6 | `express.json()` | Chuỗi JSON → `req.body` | **Sau** CSRF: chưa tin request thì chưa tốn công phân tích body |
| 7 | `sanitizeInputs` | Bỏ khoá toán tử Mongo (`$gt`, `$ne`) | Trước mọi route — chặn NoSQL injection từ gốc |

**Chi tiết đáng chú ý ở bước 6:** endpoint quét ảnh camera bị **loại trừ** khỏi bộ phân
tích JSON chung (giới hạn 1MB) vì ảnh base64 nặng hơn thế; nó tự gắn bộ phân tích 4MB
riêng đằng sau rate limiter của nó.

### 2.3 Chặng 2 — định tuyến (`src/routes/`)

Route được lắp lồng nhau ba tầng, ghép lại thành URL cuối cùng:

```js
// app.js
app.use('/api', routes);                          //  /api

// routes/index.js
router.use('/users', userRoutes);                 //  /api/users

// routes/user/index.js
router.use('/incidents', authenticate, incidentRoutes);   //  /api/users/incidents

// routes/user/incident.routes.js
router.post('/', controller.createIncident);      //  POST /api/users/incidents  ✓
```

Middleware gắn ở tầng cha áp cho **toàn bộ** tuyến con. `authenticate` đặt ở
`routes/user/index.js` nghĩa là mọi endpoint dưới `/api/users/...` đều bắt buộc đăng nhập
— không phải nhớ gắn lại ở từng route, và cũng **không thể quên**.

### 2.4 Chặng 3 — xác thực (`authenticate`)

```js
const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.[COOKIE_NAME];
if (!token) throw new AppError("Access denied. No token provided.", 401);

const { id, tv } = verifyToken(token);        // giải mã + kiểm chữ ký JWT
const user = await User.findById(id);          // ← await: chờ DB, event loop đi việc khác
if (!user) throw new AppError("User no longer exists", 401);

if (typeof tv !== "number" || tv !== (user.tokenVersion || 0)) {
  throw new AppError("Session has been revoked. Please sign in again.", 401, "TOKEN_REVOKED");
}

req.user = user;   // ← gắn vào req để các chặng sau dùng
next();            // ← chuyển tiếp
```

Ba điểm nên hiểu:

- **`?.` (optional chaining)**: `req.cookies?.[COOKIE_NAME]` — nếu `req.cookies` là
  `undefined` thì trả `undefined` chứ không nổ lỗi. Không có nó phải viết
  `req.cookies && req.cookies[...]`.
- **Phá cấu trúc (destructuring)**: `const { id, tv } = verifyToken(token)` bóc thẳng hai
  trường ra biến, thay vì `const payload = ...; payload.id; payload.tv`.
- **`tokenVersion`**: mỗi lần đăng xuất toàn bộ thiết bị hoặc đổi mật khẩu, số này tăng
  lên. Token cũ mang số cũ → không khớp → chết ngay. JWT vốn không thu hồi được; đây là
  cách thu hồi nó.

### 2.5 Chặng 4 — controller (mỏng, có chủ đích)

```js
const createIncident = asyncHandler(async (req, res) => {
  const result = await service.createIncident(req.user._id, req.body);
  sendSuccess(res, { statusCode: 201, message: 'Incident reported', data: result });
});
```

Controller chỉ làm 3 việc: **bóc dữ liệu ra khỏi `req`** → **gọi service** → **trả lời**.
Nó **không** truy vấn DB, **không** chứa luật nghiệp vụ, **không** `try/catch`.

Vì sao phải mỏng? Vì service không dính `req`/`res` thì test gọi thẳng được như hàm thường,
không cần dựng HTTP:

```js
await expect(
  userIncidentSvc.createIncident(reporter._id, { type: 'other' }),
).rejects.toMatchObject({ errorCode: 'ACTIVE_SESSION_REQUIRED' });
```

### 2.6 Chặng 5 — service (nơi chứa toàn bộ luật)

Đây là tầng dày nhất. Đọc `src/services/user/incident.service.js`, hàm `createIncident`:

```js
// ① Kiểm tra đầu vào — sai thì dừng NGAY, chưa đụng DB
const type = String(payload.type || '').trim();
if (!type) throw new AppError('type is required', 400, 'INVALID_INCIDENT_TYPE');

// ② Lấy dữ liệu để quyết định — người báo cáo có đang đỗ xe không?
const activeSessions = await ParkingSession.find({ user: userId, status: 'active' })
  .sort('-entryTime')
  .select('building slot plateNumber');

// ③ Áp luật nghiệp vụ
if (activeSessions.length === 0) {
  throw new AppError('Bạn chỉ có thể báo cáo sự cố khi xe đang đỗ trong bãi.',
    409, 'ACTIVE_SESSION_REQUIRED');
}

// ④ Suy dữ liệu từ SERVER, không tin client
const buildingId = session.building;

// ⑤ Ghi
const incident = await Incident.create({ ... });
```

**Trình tự này là một khuôn mẫu lặp lại ở mọi service trong project:**
kiểm tra rẻ trước (không tốn DB) → truy vấn → áp luật → ghi.

**Bài học thiết kế quan trọng nhất ở đây — ở bước ④.** Client có gửi `buildingId` lên,
nhưng service **không dùng giá trị đó làm chuẩn**; nó lấy tòa nhà từ chính phiên gửi xe
đang mở trong DB. Nguyên tắc: **dữ liệu quyết định quyền hạn phải do server suy ra, không
bao giờ tin client**. Client sửa được mọi thứ nó gửi.

### 2.7 Chặng 6 — trả lời hoặc trả lỗi

**Nếu thành công**, `sendSuccess` (`src/utils/response.js`) đóng gói theo một khuôn duy
nhất cho toàn hệ thống:

```js
{ "success": true, "message": "Incident reported", "data": { "item": { ... } } }
```

Khuôn cố định để frontend viết **một** hàm xử lý phản hồi dùng chung, thay vì mỗi endpoint
một kiểu.

**Nếu có lỗi**, `throw` bên trong service → `asyncHandler` bắt → `next(err)` → nhảy thẳng
tới `errorHandler` (`src/middlewares/error.middleware.js`), bỏ qua mọi middleware ở giữa.
`errorHandler` dịch lỗi sang HTTP:

| Loại lỗi | Thành |
|---|---|
| `AppError` | Dùng đúng `statusCode` + `errorCode` đã khai |
| `ValidationError` của Mongoose | 400 + gộp các thông báo trường |
| Trùng khoá (`code === 11000`) | 409 "A record with this ... already exists" |
| `CastError` (ID sai định dạng) | 400 "Invalid resource ID" |
| Còn lại | 500 — **luôn ghi log**, và **che thông báo** ở production |

### 2.8 Toàn cảnh trên một trục thời gian

```
0ms   Trình duyệt gửi POST /api/users/incidents
      │
1ms   app.js: header → nén → cookie → CSRF → CORS → parse JSON → lọc ký tự độc
      │
2ms   routes: khớp /api → /users → /incidents → POST /
      │
2ms   authenticate: đọc cookie, verify JWT (đồng bộ, nhanh)
      ├─ await User.findById()          ← chờ DB ~15ms, event loop phục vụ người khác
17ms  ├─ so tokenVersion → req.user = user → next()
      │
17ms  controller: bóc req.user._id + req.body → gọi service
      │
17ms  service: kiểm tra type (đồng bộ, ~0ms)
      ├─ await ParkingSession.find()    ← chờ DB ~15ms
32ms  ├─ không có phiên active? → throw AppError(409)  ─────┐
      ├─ await Incident.create()        ← chờ DB ~15ms      │
47ms  └─ trả { item: incident }                             │
      │                                                     │
47ms  sendSuccess → 201 JSON                    errorHandler ┘ → 409 JSON
```

Tổng ~47ms, trong đó **~45ms là ngồi chờ database**. Đó là lý do toàn bộ tầng service
phải `async` — và cũng là lý do tối ưu backend gần như luôn là tối ưu truy vấn, không
phải tối ưu vòng lặp JavaScript.

---

## Phần 3 — Kết nối và làm việc với database

### 3.1 Bức tranh chung

| Thành phần | Vai trò |
|---|---|
| **MongoDB Atlas** | Database thật, chạy trên cloud (không cài trên máy) |
| **MongoDB** | Cơ sở dữ liệu **NoSQL dạng tài liệu** — lưu document giống JSON, không phải bảng/hàng |
| **Mongoose** | Thư viện Node nói chuyện với MongoDB; thêm **schema**, **validation**, **populate** |
| **`mongodb-memory-server`** | MongoDB giả chạy trong RAM, chỉ dùng khi chạy test |

**Vì sao MongoDB chứ không phải SQL?** Dữ liệu ở đây phân nhánh mạnh: một phiên gửi xe có
thể có gói hoặc không, có ảnh hoặc không, có phạt hoặc không. Với SQL sẽ là nhiều bảng
phụ và rất nhiều `JOIN`. Đổi lại, MongoDB **không tự đảm bảo toàn vẹn tham chiếu** — nên
project bù lại bằng validation ở Mongoose và **transaction** cho mọi thao tác tiền bạc.

### 3.2 Chuỗi kết nối lấy từ đâu

`src/config/env.js` đọc file `.env` bằng `dotenv`, gom mọi biến môi trường về **một** đối
tượng:

```js
require('dotenv').config();          // nạp .env vào process.env

const env = {
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  ...
};

// Thiếu biến bắt buộc → NỔ NGAY lúc khởi động, không chờ tới lúc có request
const required = ['mongodbUri', 'jwtSecret', 'payosClientId', 'payosApiKey', 'payosChecksumKey'];
const missing = required.filter((key) => !env[key]);
if (missing.length) {
  throw new Error(`Missing env: ${missing.join(', ')}. Copy .env.example to .env ...`);
}
```

**Đây là mẫu "fail fast" — hỏng thì hỏng sớm và ồn ào.** Nếu để `undefined` trôi qua,
server vẫn khởi động bình thường và chỉ chết vào lúc khách hàng đầu tiên bấm nút. Chết
ngay lúc khởi động thì người deploy biết liền.

Chuỗi kết nối Atlas có dạng:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<tên-database>?retryWrites=true&w=majority
```

`.env` **không bao giờ được commit** — nó nằm trong `.gitignore` vì chứa mật khẩu DB.
Bản mẫu không có bí mật là `.env.example`. Trên server thật (Render), các biến này được
nhập tay trong bảng cấu hình của nền tảng.

### 3.3 Mở kết nối (`src/config/db.js`)

```js
const dns = require('node:dns');

// Trình phân giải DNS của máy/ISP nhiều nơi từ chối bản ghi SRV mà mongodb+srv cần.
// 8.8.8.8 (Google) và 1.1.1.1 (Cloudflare) là DNS công cộng, không phải bí mật.
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { ... }

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongodbUri);
    logger.info(`[MongoDB] ${conn.connection.host} / ${conn.connection.name}`);
  } catch (err) {
    logger.error('[MongoDB] connect error:', err);
    throw err;     // ném lên để server.js dừng hẳn — chạy mà không có DB là vô nghĩa
  }
};
```

`mongoose.connect()` gọi **một lần duy nhất** lúc khởi động, trong `src/server.js`:

```js
const start = async () => {
  await connectDB();                              // ① DB trước
  require('./jobs/subscriptionExpiry.job').start(); // ② rồi mới tới job nền
  require('./jobs/keepAlive.job').start();
  const port = await findAvailablePort(env.port);
  server = await listen(port);                     // ③ cuối cùng mới mở cổng HTTP
};
```

Thứ tự có chủ đích: **mở cổng nhận request sau cùng**. Nhận request khi DB chưa sẵn sàng
thì chỉ tạo ra một loạt lỗi 500 vô ích.

**Không cần "mở/đóng kết nối" ở từng truy vấn.** Mongoose duy trì sẵn một **connection
pool** — một nhóm kết nối mở sẵn, dùng lại liên tục. Mỗi truy vấn mượn một kết nối rảnh
rồi trả về. Bắt tay TCP + TLS với Atlas tốn cả trăm mili-giây, làm lại mỗi request thì
không server nào chịu nổi.

**Tắt máy êm (graceful shutdown)** — `server.js`:

```js
process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => shutdown('SIGTERM')); // nền tảng cloud yêu cầu dừng

const shutdown = async (signal) => {
  if (server) await new Promise((resolve) => server.close(resolve)); // ngừng nhận request mới
  await mongoose.connection.close();                                  // rồi mới đóng DB
  process.exit(0);
};
```

Đóng DB trước khi các request đang dở chạy xong sẽ làm hỏng giữa chừng — nên phải đóng
cổng HTTP trước, DB sau.

### 3.4 Schema và Model — khuôn dữ liệu

**Schema** mô tả hình dạng dữ liệu. **Model** là lớp bạn gọi để truy vấn.

```js
const paymentSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,   // khoá ngoại
      ref: 'Building',                        // trỏ tới model nào (dùng cho populate)
      required: true,
      index: true,                            // tạo index cho trường này
    },
    amount: { type: Number, required: true, min: 0 },
    type:   { type: String, enum: PAYMENT_TYPES },   // chỉ nhận giá trị trong danh sách
    status: { type: String, enum: PAYMENT_STATUS, default: 'pending' },
  },
  { timestamps: true }   // tự thêm createdAt / updatedAt
);

module.exports = mongoose.model('Payment', paymentSchema);
```

Vài điểm cần nắm:

- **`ObjectId`** là khoá chính 12 byte MongoDB tự sinh, không phải số tăng dần.
- **`enum`** chỉ được kiểm **lúc ghi**, không kiểm lúc đọc. Nên bỏ một giá trị khỏi `enum`
  vẫn **đọc** được bản ghi cũ mang giá trị đó, chỉ là không `.save()` lại được.
- **`timestamps: true`** tiết kiệm việc tự quản `createdAt`/`updatedAt` ở mọi nơi.
- Tên model `'Payment'` → Mongoose tự suy ra collection `payments` (thường hoá + số nhiều).
  Muốn ghim tên khác thì khai `{ collection: 'ten_khac' }` — project dùng đúng cách này ở
  `src/models/policy/RefundPolicy.js` để model đổi tên mà dữ liệu cũ không mất.

**Hook `pre('save')`** chạy tự động trước khi lưu — chỗ băm mật khẩu trong
`src/models/user/User.js`. Đặt ở model chứ không ở service để **không đường nào** tạo được
User mà quên băm mật khẩu.

### 3.5 Truy vấn — những câu hay dùng

```js
// TÌM
await User.findById(id);                          // theo khoá chính
await User.findOne({ email });                    // một bản ghi
await ParkingSession.find({ user: userId, status: 'active' });   // nhiều bản ghi
await User.exists({ email });                     // chỉ hỏi "có không" → nhanh hơn find

// LỌC BỚT DỮ LIỆU TRẢ VỀ
.select('building slot plateNumber')  // chỉ lấy 3 trường, không kéo cả document
.sort('-entryTime')                   // dấu trừ = giảm dần
.limit(20).skip(40)                   // phân trang
.lean()                               // trả object JS thuần, KHÔNG phải document Mongoose

// GHI
await Incident.create({ ... });
await Model.findOneAndUpdate(filter, update, { new: true });  // new: trả bản SAU khi sửa
await Model.updateMany(filter, update);

// ĐẾM / TỔNG HỢP
await Incident.countDocuments(filter);
await Payment.aggregate([{ $match: {...} }, { $group: {...} }]);
```

**Khi nào dùng `.lean()`?** Document Mongoose là object "nặng" có kèm `.save()`,
validation, theo dõi thay đổi. Chỉ đọc để trả về cho client thì `.lean()` nhanh hơn và
tốn ít bộ nhớ hơn nhiều. Nhưng object `lean` **không gọi được `.save()`** — cần sửa rồi
lưu thì đừng dùng.

**`populate` — thay khoá ngoại bằng dữ liệu thật:**

```js
Incident.find(filter)
  .populate({ path: 'building', select: '_id code name' })
  .populate({ path: 'slot', select: '_id code' })
```

Không có `populate`, `incident.building` chỉ là một `ObjectId`. Có rồi, nó thành object
đầy đủ `{ _id, code, name }`. Luôn kèm `select` để không kéo về cả document tòa nhà.

> **Cẩn thận bẫy N+1.** Gọi `populate` (hoặc truy vấn) **bên trong vòng lặp** thì 100 bản
> ghi thành 101 lượt hỏi DB. Đúng cách là lấy hết ID rồi truy vấn **một lần** bằng
> `$in: [...]`, sau đó ghép trong bộ nhớ.

### 3.6 Index — vì sao phải khai báo

Không có index, MongoDB phải **quét toàn bộ collection** để tìm một bản ghi. 10 bản ghi
thì không thấy gì; 100.000 bản ghi thì treo.

```js
parkingSessionSchema.index({ building: 1, status: 1 });   // 1 = tăng dần
```

Index còn dùng để **cưỡng chế luật nghiệp vụ ở tầng thấp nhất** — đây mới là công dụng
đáng nói:

```js
parkingSessionSchema.index(
  { building: 1, plateNumber: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
```

Nghĩa: **trong cùng một tòa nhà, một biển số chỉ được có tối đa một phiên đang mở**.
`partialFilterExpression` giới hạn luật chỉ áp cho bản ghi `status: 'active'` — xe ra vào
100 lần vẫn để lại 100 phiên đã đóng mà không vi phạm.

**Vì sao không kiểm bằng `findOne` trong service cho đơn giản?** Vì hai request đến **cùng
lúc** sẽ cùng thấy "chưa có" rồi cùng ghi — sinh ra hai phiên trùng. Đây gọi là **race
condition**. Chỉ index unique ở tầng DB mới chặn được thật sự. Service vẫn kiểm trước để
báo lỗi đẹp, nhưng index mới là hàng rào cuối.

### 3.7 Transaction — tất cả hoặc không gì cả

Một lần check-out làm **bốn** việc: trừ ví khách, tạo `Payment`, cộng ví tòa nhà, trả ô đỗ
về `available`. Hỏng ở việc thứ ba thì khách **mất tiền mà ô vẫn kẹt**.

Transaction đảm bảo **hoặc cả bốn cùng thành công, hoặc không việc nào xảy ra**:

```js
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    await User.updateOne({ _id }, { $inc: { walletBalance: -fee } }, { session });
    await Payment.create([{ ... }], { session });
    await BuildingWallet.updateOne({ ... }, { session });
    await ParkingSlot.updateOne({ ... }, { session });
  });
} finally {
  session.endSession();   // LUÔN đóng, kể cả khi ném lỗi
}
```

Ba điều bắt buộc nhớ:

1. **Mọi** truy vấn trong transaction phải nhận `{ session }`. Quên một câu là câu đó nằm
   ngoài transaction và **không** được hoàn tác.
2. `withTransaction` **tự rollback** khi callback ném lỗi, và tự thử lại khi gặp xung đột
   tạm thời.
3. `endSession()` đặt trong `finally` để không rò rỉ phiên.

> Transaction **chỉ chạy được trên replica set**. MongoDB Atlas mặc định là replica set nên
> chạy tốt; MongoDB cài đơn lẻ trên máy cá nhân thì **không**.

### 3.8 Cập nhật có điều kiện — chống đua lệnh không cần khoá

Đây là kỹ thuật đáng chú ý nhất trong project. Cách viết **sai** phổ biến:

```js
const user = await User.findById(id);
if (user.walletBalance >= fee) {              // ① đọc và kiểm
  user.walletBalance -= fee;                   // ② tính
  await user.save();                           // ③ ghi
}
```

Giữa ① và ③ có khoảng trống thời gian. Hai request cùng lúc đều đọc thấy số dư 100.000,
đều thấy đủ tiền, đều trừ → **ví âm**.

Cách **đúng** — gộp điều kiện vào chính câu lệnh ghi, để MongoDB kiểm và ghi trong **một
thao tác nguyên tử**:

```js
await User.updateOne(
  { _id: targetUserId, walletBalance: { $gte: fee } },   // điều kiện nằm TRONG filter
  { $inc: { walletBalance: -fee } },                      // $inc: cộng/trừ nguyên tử
  { session }
);
```

Hai request chạy song song thì chỉ một request khớp filter, request kia không tìm thấy
bản ghi nào để sửa → không trừ. **Không thể âm ví.**

Cùng kỹ thuật đó dùng để chiếm ô đỗ:

```js
findOneAndUpdate({ _id: slotId, status: 'available' }, { status: 'occupied' })
```

Hai nhân viên bấm cùng lúc: người thứ hai nhận `null` vì ô đã không còn `available`.

### 3.9 Database khi chạy test

Test **không bao giờ** đụng vào database thật. `tests/helpers/db.js` dựng một MongoDB
chạy hoàn toàn trong RAM (`mongodb-memory-server`):

```js
beforeAll(async () => { await db.connect(); });   // dựng DB trong RAM
afterAll(async () => { await db.close(); });      // xoá sạch
beforeEach(async () => { await db.clear(); });    // mỗi test bắt đầu từ DB rỗng
```

`db.clear()` ở `beforeEach` là điều kiện để test **độc lập** — test A không được để lại dữ
liệu ảnh hưởng test B, và thứ tự chạy test không được làm đổi kết quả.

---

## Phần 4 — Nguyên tắc thiết kế đã áp dụng

Đây là phần giảng viên hay hỏi trước khi hỏi tới code: *"Các em áp dụng cái gì?"*

### 4.1 Kiến trúc phân tầng (Layered Architecture)

Mỗi request đi qua đúng 4 tầng, không tầng nào được nhảy cóc:

```
routes/        → khai báo URL + gắn middleware (KHÔNG chứa logic nghiệp vụ)
controllers/   → đọc req, gọi service, trả response (KHÔNG truy cập DB)
services/      → TOÀN BỘ logic nghiệp vụ + transaction (KHÔNG biết req/res)
models/        → schema Mongoose + ràng buộc dữ liệu ở tầng DB
```

**Vì sao tách?** Service không phụ thuộc Express nên test được bằng cách gọi hàm thẳng,
không cần dựng HTTP. Xem `tests/integration/staff/qrLookupScope.service.test.js` — gọi
thẳng `usersService.resolveQr(...)` không qua supertest.

Chứng minh bằng code: `src/controllers/staff/parkingSession.controller.js:58-65` —
controller `scan` chỉ có 6 dòng, nhiệm vụ duy nhất là bóc `req.body` rồi gọi service.

### 4.2 RBAC — phân quyền theo vai trò

4 vai trò, khai ở `src/constants/roles.js:1-6`: `admin`, `manager`, `staff`, `user`.

Cưỡng chế ở `src/middlewares/rbac.middleware.js`:

| Hàm | Dòng | Nhiệm vụ |
|---|---|---|
| `extractBuildingId` | 17-27 | Tìm `buildingId` ở params → query → body |
| `authorizeBuildingAccess` | 29-70 | Chặn nhân sự thao tác lên tòa nhà **không được phân công** |
| `readOnlyForAdmin` | 78-89 | Admin = người vận hành **chỉ đọc**: cho GET/HEAD/OPTIONS, chặn mọi lệnh ghi |

**Điểm đáng nói khi bảo vệ:** `readOnlyForAdmin` là quyết định thiết kế có chủ đích —
admin nhìn được cấu hình mọi tòa nhà để hỗ trợ vận hành, nhưng **không** được sửa, vì
tòa nhà là tài sản của manager. Không phải "quên làm chức năng sửa".

### 4.3 Giao dịch ACID cho tiền và ô đỗ

Mọi thao tác chạm vào **tiền** hoặc **trạng thái ô đỗ** đều nằm trong
`mongoose.startSession()` + `withTransaction`. Lý do: một lần check-out vừa trừ ví
khách, vừa tạo `Payment`, vừa cộng ví tòa nhà, vừa trả ô đỗ về `available` — hỏng giữa
chừng là mất tiền hoặc kẹt ô.

Ví dụ: `src/services/user/longTerm.service.js:142-145` (mua gói),
`src/services/staff/parkingSession/checkOut.service.js:547` (check-out).

Chống đặt trùng chỗ dùng **cập nhật có điều kiện** thay vì đọc-rồi-ghi:
`findOneAndUpdate({ _id, status: 'available' }, { status: 'occupied' })` — hai nhân viên
bấm cùng lúc thì chỉ một người thắng, ngay ở tầng DB.

Trừ ví cũng vậy — `src/services/staff/parkingSession/checkOut.service.js:396-397`:
```js
{ _id: targetUserId, walletBalance: { $gte: fee } },
{ $inc: { walletBalance: -fee } }
```
Điều kiện `$gte: fee` nằm trong chính câu lệnh update → **không thể** âm ví do đua lệnh.

### 4.4 Một nguồn sự thật (Single Source of Truth)

Nguyên tắc được áp dụng lặp lại, mỗi lần đều để sửa một lỗi trôi lệch có thật:

| Khái niệm | Nguồn duy nhất | Trước đây sai thế nào |
|---|---|---|
| Thể loại xe | `src/constants/vehicle.js:19-27` | Danh sách bị chép 3 nơi, User có 7 giá trị mà validator chỉ cho 5 |
| Doanh thu | model `Payment` | Từng có model `ShiftRevenue` song song, hai bên lệch số |
| % hoàn tiền huỷ gói | `src/utils/refundPolicy.js:19-25` | Mỗi luồng huỷ có default riêng → hứa 80% mà trả 0đ |
| Hạn QR phương tiện | `env.vehicleQrTtlDays` | Nếu để mỗi tòa tự đặt, một xe đi 3 tòa sẽ có 3 hạn mâu thuẫn |
| "Gói còn hiệu lực" | `activeSubscriptionMatch()` — `helpers.js:131` | Màn hình quét và lúc check-in xét khác nhau |

### 4.5 Chuẩn hoá dữ liệu đầu vào

Biển số được đưa về **dạng canonical** `59G2-038.80` ngay tại cửa ngõ, ở mọi luồng.
`src/utils/plate.util.js` → `normalizePlate`. Không có bước này thì `59G2-81000` và
`59G2-810.00` là hai xe khác nhau trong DB.

`plateCore` (`src/models/vehicle/Vehicle.js`) là khoá tra cứu đã bỏ hết dấu phân cách —
dùng cho unique index, để không phụ thuộc cách người dùng gõ.

### 4.6 An toàn theo chiều sâu (Defense in Depth)

Một quy tắc nghiệp vụ được chặn ở **nhiều tầng**, không tin tầng nào duy nhất:

Ví dụ luật "thể loại xe phải khớp sê-ri biển số":
1. FE cảnh báo sớm khi gõ (`utils/plate.ts` bên FE)
2. Validator chặn lúc tạo (`src/utils/vehicleRules.js:18-29`)
3. Service chặn lúc đổi thể loại (cùng hàm trên, gọi lại)
4. Index DB chặn trùng biển

### 4.7 Suy giảm có kiểm soát (Graceful Degradation)

Camera AI chết **không được** làm liệt cả cổng vào.
`src/services/staff/parkingSession/query.service.js:314-330`: provider OCR hỏng thì trả
**HTTP 200** kèm `scanStatus: 'unavailable'` và biển số rỗng, để nhân viên nhập tay.
Chỉ payload sai định dạng mới là lỗi 4xx thật.

Ranh giới của nguyên tắc này: **không phải dịch vụ ngoài nào hỏng cũng "đi tiếp được".**
Gửi email OTP mà hỏng thì người dùng không có mã để nhập — đăng ký trở nên vô nghĩa. Nên
ở `requestRegistration` (`auth.service.js`), SMTP hỏng được dịch thành lỗi nghiệp vụ
`OTP_EMAIL_SEND_FAILED` (503) để người dùng biết mà thử lại, chứ **không** âm thầm bỏ qua.
Phân biệt: OCR hỏng còn đường thủ công thay thế, email OTP thì không.

### 4.8 Quan sát được (Observability) — bài học từ một sự cố thật

Ngày 01/08/2026, đăng ký trên production trả 500 mà **log không có gì**. Nguyên nhân kép:

1. `errorHandler` chỉ ghi log khi `NODE_ENV === 'development'` → mọi lỗi 5xx ở production
   biến mất không dấu vết.
2. Thông báo lỗi thô lại **trả thẳng ra client**: `connect ENETUNREACH 2607:f8b0:...:587`.

Tức là vừa **không** log chỗ cần log, vừa **có** lộ chỗ cần giấu — sai cả hai chiều. Đã sửa
ở `src/middlewares/error.middleware.js`: 5xx **luôn** được ghi log kèm method + URL, và
thông báo của lỗi **không phải** `AppError` bị che thành `Internal Server Error` ở
production (xem lại mục 1.7 về cờ `isOperational`).

Nguyên nhân gốc của chính sự cố đó cũng đáng nhớ: `smtp.gmail.com` có **cả** bản ghi A
(IPv4) lẫn AAAA (IPv6), trong khi container trên Render có interface IPv6 nhưng **không có
đường ra** IPv6. Thư viện gửi mail bốc trúng địa chỉ IPv6 là chết ngay. Cách xử lý ở
`src/utils/email.js`: tự phân giải sang IPv4 rồi đưa thẳng IP làm host, kèm `servername`
để bắt tay TLS vẫn kiểm chứng đúng chứng chỉ Gmail.

> **Bài học rút ra:** trước khi đoán lỗi, hãy làm cho lỗi **nhìn thấy được**. Một dòng
> `if (NODE_ENV === 'development')` đặt sai chỗ đã giấu nguyên nhân suốt nhiều giờ.

---

## Phần 5 — Bản đồ tra cứu nhanh

Giảng viên hỏi chức năng nào, mở đúng dòng này:

| Nghiệp vụ | File | Hàm : dòng |
|---|---|---|
| **Đăng ký tài khoản (OTP 2 bước)** | `src/services/auth.service.js` | `requestRegistration:149`, `verifyOtpAndRegister:192` |
| **Đăng nhập** | `src/services/auth.service.js` | `login:42` |
| **Quên mật khẩu (email)** | `src/services/auth.service.js` | `forgotPassword:92`, `resetPassword:114` |
| **Quên mật khẩu (SMS OTP)** | `src/services/auth.service.js` | `requestPasswordResetSms:224`, `resetPasswordSms:251` |
| **Đăng xuất mọi thiết bị** | `src/services/auth.service.js` | `revokeSessions:293`, `bumpTokenVersion:34` |
| **Đăng ký xe** | `src/services/user/vehicle.service.js` | `add:58` |
| **Sửa / xoá xe** | `src/services/user/vehicle.service.js` | `update:103`, `remove:135` |
| **QR phương tiện + hết hạn** | `src/services/user/vehicleQr.service.js` | `isQrExpired:31`, `ensureFreshQr:49`, `resolveScannedQr:72` |
| **Nạp ví khách** | `src/services/user/wallet.service.js` | `topup:25`, `settleTopup:106` |
| **Mua gói dài hạn** | `src/services/user/longTerm.service.js` | `subscribe:66` |
| **Huỷ gói + hoàn tiền** | `src/services/user/longTerm.service.js` | `cancelSubscription:297` |
| **Gia hạn gói** | `src/services/user/longTerm.service.js` | `renewSubscription:435` |
| **Xem trước tiền hoàn** | `src/services/user/longTerm.service.js` | `getRefundPreview:599` |
| **Quét ảnh nhận diện biển** | `src/services/staff/visionScan.service.js` | `scanVehicleImage:281`, `resolveProviderChain:249`, `parseImage:76` |
| **Tra cứu biển số tại cổng** | `src/services/staff/parkingSession/query.service.js` | `lookupPlate:143`, `scanVehicle:305` |
| **Quét QR tại cổng** | `src/services/staff/users.service.js` | `resolveQr:136`, `lookupQr:36`, `lookupPlateQr:100` |
| **CHECK-IN** | `src/services/staff/parkingSession/checkIn.service.js` | `checkIn:80` |
| **CHECK-OUT** | `src/services/staff/parkingSession/checkOut.service.js` | `checkOut:547` |
| **Tính phí gửi xe** | `src/utils/feeEngine.js` | `computeFee:59`, `calculateTotalPeakMinutes:20` |
| **Tính giờ vượt hạn mức gói** | `src/utils/longTermUsage.js` | `computeDailyOverageHours:28` |
| **Thanh toán PayOS tại cổng** | `src/services/staff/parkingSession/payment.service.js` | `initiatePayment:135`, `settleSessionPayment:222` |
| **Webhook PayOS** | `src/services/payment/webhook.service.js` | toàn file |
| **Ví tòa nhà (thu/chi)** | `src/services/manager/buildingWallet.service.js` | `credit:51`, `debit:79` |
| **Xác nhận tiền mặt** | `src/services/manager/buildingWallet.service.js` | `listPendingCash:256`, `confirmCash:291` |
| **User báo cáo sự cố** | `src/services/user/incident.service.js` | `createIncident:32`, `listMyIncidents` |
| **Sự cố + phạt** | `src/services/shared/incidentResolve.service.js` | `applyIncidentAction:148`, `settlePendingPenaltyAtCheckout:45` |
| **Vòng đời ô đỗ** | `src/services/shared/slotLifecycle.service.js` | `occupyFixedSlotForCheckIn:126`, `finalizeSlotAfterCheckout:163` |
| **Gói hết hạn tự động** | `src/services/shared/slotLifecycle.service.js` | `expireStaleSubscriptions:47` + `src/jobs/subscriptionExpiry.job.js` |
| **Ca làm việc (gating)** | `src/services/shared/entryAuthorization.service.js` | `assertStaffHasActiveShift:35` |
| **Kiosk tự check-in** | `src/services/kiosk.service.js` | `selfCheckInByQr:54` |
| **Cấu hình tòa nhà** | `src/services/manager/` | `floor/zone/slot/gate/vehicleType/pricing/package.service.js` |
| **Doanh thu admin** | `src/services/admin/revenue.service.js` | toàn file |
| **Nhật ký kiểm toán** | `src/utils/audit.js` + `src/models/log/AuditLog.js` | — |

---

## Phần 6 — Chi tiết từng nghiệp vụ

### 6.1 Xác thực & tài khoản

**Đăng ký là quy trình 2 bước, cố ý.** Không có endpoint "đăng ký thẳng".

```
POST /api/users/auth/register-request   → requestRegistration()  auth.service.js:149
   ├─ tạo OtpVerification, hash OTP bằng SHA-256 (auth.service.js:18)
   └─ gửi mã 6 số qua email (utils/email.js)

POST /api/users/auth/register-verify    → verifyOtpAndRegister() auth.service.js:192
   └─ đối chiếu hash, ĐÚNG mới tạo User
```

**Trả lời giảng viên "vì sao 2 bước?"** — tài khoản chỉ tồn tại sau khi email được chứng
minh là có thật. Đăng ký thẳng sẽ tạo rác trong DB bằng email không tồn tại, và luồng
quên-mật-khẩu sẽ vô dụng vì không gửi được thư tới đó.

**Mật khẩu**: hash bằng bcrypt trong `src/models/user/User.js` (hook `pre('save')`).
Luật độ mạnh ở `src/utils/passwordPolicy.js`.

**Token nằm trong cookie httpOnly, KHÔNG trả trong body.**
`src/utils/authCookie.js` set cookie `pbms_token`. Đây là điểm nên chủ động khoe: JWT
trong `localStorage` bị đánh cắp bởi bất kỳ script XSS nào; cookie `httpOnly` thì
JavaScript không đọc được. Kèm theo là chống CSRF ở
`src/middlewares/csrf.middleware.js` (`enforceCsrfOrigin`, `requireJsonForCookieWrites`).

**Thu hồi phiên**: `bumpTokenVersion` (`auth.service.js:34`) tăng `tokenVersion` trên
User; middleware auth so sánh version trong token với version trong DB → mọi token cũ
chết ngay. Đổi mật khẩu cũng gọi hàm này.

**Khoá tài khoản sau nhiều lần sai**: đếm ở `login` (`auth.service.js:43`).

**Chống dò email đã đăng ký (user enumeration).** `requestRegistration` **kết thúc im lặng**
khi email đã tồn tại hoặc số điện thoại thuộc về người khác — không ném 409. Controller trả
đúng một thông báo chung cho mọi trường hợp:

> *"If that email can be registered, a verification code has been sent to it."*

Vì sao? Trả 409 "Email đã tồn tại" cho một người **chưa đăng nhập** là tự khai danh sách
email nào có tài khoản trong hệ thống. Việc chặn trùng thật sự nằm ở
`verifyOtpAndRegister` (chỉ chạy được khi người gọi chứng minh đã đọc được hòm thư) và ở
unique index tầng DB. `POST /register` cũ trả **410** kèm mã `REGISTRATION_ENDPOINT_REMOVED`
— cố ý không phải 404, để client chưa cập nhật nhận được câu trả lời chẩn đoán được.

---

### 6.2 Phương tiện & mã QR

Xe là **collection riêng** (`src/models/vehicle/Vehicle.js`), không phải mảng trong
`User`. Đây là một refactor có chủ đích — trước đây `User.licensePlates` là mảng, không
đánh index unique được nên hai người đăng ký cùng một biển vẫn lọt.

**Luật đăng ký xe** (`src/services/user/vehicle.service.js:58` — `add`):
1. Chuẩn hoá biển → `normalizePlate`
2. Thể loại phải khớp sê-ri biển → `assertCategoryMatchesPlate` (`utils/vehicleRules.js:18`)
3. `plateCore` unique toàn hệ thống → một biển chỉ thuộc một chủ

**Xoá xe** (`remove:135`) chặn nếu xe đang có phiên gửi hoặc gói còn hạn —
`findActiveUsage:31`.

**QR có hạn** (`src/services/user/vehicleQr.service.js`):

| Hàm | Dòng | Việc |
|---|---|---|
| `qrTtlMs` | 23 | Hạn = `VEHICLE_QR_TTL_DAYS` (mặc định 2 ngày) |
| `isQrExpired` | 31 | Kiểm tra hết hạn |
| `ensureFreshQr` | 49 | Hết hạn thì **tự cấp lại** khi chủ xe mở mã |
| `resolveScannedQr` | 72 | Cổng quét: hết hạn → `410 VEHICLE_QR_EXPIRED` |

**Vì sao QR phải hết hạn?** QR là ảnh, ảnh chụp màn hình được. Không có hạn thì ảnh chụp
lén dùng được vĩnh viễn. Hạn 2 ngày giới hạn thiệt hại mà không phiền chủ xe (mở app là
tự có mã mới).

---

### 6.3 Gói dài hạn

**Mua gói** — `src/services/user/longTerm.service.js:66` (`subscribe`). Hàng rào theo thứ tự:

| Dòng | Kiểm tra | Lỗi trả về |
|---|---|---|
| 69-72 | Biển hợp lệ | 400 |
| 73-83 | **Biển phải thuộc tài khoản đang mua** | 403 `PLATE_OWNERSHIP_REQUIRED` |
| 87-94 | 1 biển = 1 gói tại một thời điểm | 400 |
| 102-108 | Danh mục loại xe của tòa đã map thể loại chưa | 409 `VEHICLE_TYPE_UNMAPPED` |
| 112-118 | Thể loại xe khớp **tuyệt đối** thể loại gói | 409 `PACKAGE_VEHICLE_TYPE_MISMATCH` |
| 119-130 | Tòa nhà đang hoạt động | 409 `BUILDING_UNAVAILABLE` |
| 134-135 | Gói bắt đầu **ngay lúc mua** | — |
| 142-145 | Thu tiền trong transaction | — |

**Điểm tinh tế đáng nhớ để trả lời:** dòng 112 dùng `isCategoryEligible`
(`constants/vehicle.js:65`) — khớp **tuyệt đối**, cố ý **khác** `kindOfCategory`. Gói bán
theo đúng danh mục tòa khai (mua gói "Ô tô" thì không dùng cho "Xe tải"), trong khi việc
khớp ô đỗ chỉ cần cùng nhóm 2 bánh/4 bánh (ô xe máy không chứa nổi xe tải). Hai khái
niệm khác nhau nên cố tình dùng hai hàm khác nhau.

**Gói là "floating" — không giữ ô cố định** (dòng 137). Nhân viên gán ô trống lúc
check-in. Lý do: giữ ô 24/7 cho một xe chỉ đỗ vài giờ/ngày là lãng phí công suất tòa nhà.

**Huỷ gói** — `cancelSubscription:297`. % hoàn lấy từ `getRefundPercent`
(`utils/refundPolicy.js:19`), mặc định 80% nếu tòa chưa cấu hình `RefundPolicy`.
`isActive: false` → hoàn 0%.

**Hạn mức giờ/ngày**: `defaultMaxHoursByDuration` (`utils/longTermUsage.js:14`) —
tuần 5h, tháng 7h, năm 10h. `maxHoursPerDay = 0` nghĩa là **không giới hạn**.

**Tự hết hạn**: `src/jobs/subscriptionExpiry.job.js` chạy nền, gọi
`expireStaleSubscriptions` (`slotLifecycle.service.js:47`). Có khoá chống chạy trùng ở
`src/utils/jobLock.js` — nhiều instance server không được cùng expire một gói.

---

### 6.4 Check-in (nghiệp vụ phức tạp nhất)

`src/services/staff/parkingSession/checkIn.service.js:80` — hàm `checkIn`, ~380 dòng,
toàn bộ nằm trong một transaction.

**Trình tự và nơi chặn:**

| Dòng | Bước | Lỗi |
|---|---|---|
| 116 | Bắt buộc có `building` | 400 |
| 119 | Bắt buộc có `plateNumber` | 400 |
| 125 | Tòa nhà tồn tại | 404 |
| — | Tòa nhà nhận xe không (giờ mở cửa, trạng thái) | `assertBuildingAcceptsEntry` — `entryAuthorization.service.js:10` |
| — | Nhân viên có ca trực đang mở không | `assertStaffHasActiveShift` — `entryAuthorization.service.js:35` |
| 153 | Tòa còn chỗ không | 409 `Building is at capacity` |
| — | Biển này đã có phiên đang mở chưa | `findDuplicateActiveSession` — `helpers.js:91` |
| 215-240 | Chọn ô: đúng zone, đúng trạng thái, đúng nhóm khách | `SLOT_REQUIRED` / `SLOT_NOT_AVAILABLE` / `SLOT_ZONE_MISMATCH` / `SLOT_USAGE_MISMATCH` |
| 329-336 | Thể loại xe khớp đăng ký | `PLATE_CATEGORY_MISMATCH` |
| 394-409 | Kiểm tra ô lần cuối trước khi chiếm | `SLOT_MAINTENANCE_NOT_AVAILABLE` … |

**Chuỗi ưu tiên ô đỗ (`usageType`)** — khái niệm cốt lõi, hay bị hỏi:

`resolveCustomerUsageType` (`helpers.js:187`) phân khách thành `walk_in` / `registered` /
`subscriber`. `acceptableUsageTypes` (`helpers.js:204`) định nghĩa chuỗi dự phòng **một
chiều**:

> Khách vãng lai **không bao giờ** lấn sang ô dành cho hội viên.
> Hội viên/khách mua gói **được phép** dùng ô vãng lai khi khu riêng đã đầy.

Một chiều là có chủ ý: người trả tiền cho quyền ưu tiên phải thực sự được ưu tiên, còn
ô trống thì không nên bỏ phí.

`slotCompatibilityFilter` (`helpers.js:217`) dựng query lọc, `usageRanker`
(`helpers.js:231`) xếp hạng để gợi ý ô tốt nhất.

**Chống trùng phiên**: unique index ở tầng DB, bắt lỗi bằng
`isDuplicateActiveSessionError` (`helpers.js:103`) rồi đổi thành lỗi nghiệp vụ dễ hiểu
(`helpers.js:111`). Chặn bằng `findOne` trước là không đủ — hai request đồng thời đều
thấy "chưa có".

---

### 6.5 Check-out & tính phí

`src/services/staff/parkingSession/checkOut.service.js:547` — hàm `checkOut`.

**Hai nhánh hoàn toàn khác nhau** (rẽ ở dòng 564):

**Nhánh A — phiên thường** (trả tiền theo lượt):
```
calculateRegularSessionFee (helpers.js:311)
  └─ computeFee (utils/feeEngine.js:59)
       ├─ lọc PricePolicy còn hiệu lực trong [vào, ra]      feeEngine.js:72-87
       ├─ tách phút cao điểm / thường                        calculateTotalPeakMinutes:20
       ├─ phí = Σ(phút peak × rate peak) + phút thường × rate thường
       └─ làm tròn LÊN: Math.ceil                            feeEngine.js:117
```

Khung cao điểm **hỗ trợ qua nửa đêm** (22:00–06:00) — `feeEngine.js:41-46` xử lý riêng
trường hợp `peakStart > peakEnd`.

**Chưa cấu hình bảng giá thì sao?** `hasPolicy: false`, `fee = 0` và **caller tự quyết**
(`feeEngine.js:57`). Check-out sẽ bị chặn chứ không âm thầm cho đỗ miễn phí. Lưới an
toàn `DEFAULT_HOURLY_RATE` (`constants/pricing.js:3` — ô tô 20.000đ, xe máy 5.000đ/giờ)
chỉ dùng cho phí vượt giờ của gói.

**Nhánh B — phiên gói dài hạn** (`checkOut.service.js:179-312`):
```
computeDailyOverageHours (utils/longTermUsage.js:28)
  ├─ cộng dồn theo NGÀY DƯƠNG LỊCH, không phải theo phiên
  ├─ gộp cả các phiên gói ĐÃ HOÀN THÀNH cùng ngày           longTermUsage.js:50-60
  └─ trả về số giờ vượt
→ tính tiền phần vượt theo bảng giá thường                   checkOut.service.js:204
→ không có bảng giá → dùng DEFAULT_HOURLY_RATE               checkOut.service.js:207
→ trừ ví (có điều kiện $gte)                                 checkOut.service.js:217-218
→ tạo Payment + credit ví tòa nhà                            checkOut.service.js:249-260
→ gửi thông báo cho khách                                    checkOut.service.js:268-279
```

**Vì sao phải gộp phiên cũ trong ngày?** Hạn mức là 7 giờ **mỗi ngày**, không phải mỗi
lần đỗ. Không gộp thì khách ra vào 3 lần × 6 giờ = 18 giờ vẫn không tính là vượt.

**Phạt sự cố chưa thu**: `settlePendingPenaltyAtCheckout`
(`incidentResolve.service.js:45`) thu nốt tại cổng. Nếu khách trả bằng PayOS mà tiền
phạt được duyệt sau khi QR đã tạo, nhân viên phải chỉ định `penaltyPaymentMethod` —
`_resolvePenaltyPaymentMethod` (`checkOut.service.js:53`).

**Trả ô đỗ**: `finalizeSlotAfterCheckout` (`slotLifecycle.service.js:163`).

---

### 6.6 Nhận diện biển số bằng camera

`src/services/staff/visionScan.service.js`.

**Kiến trúc provider** (`resolveProviderChain:249`):
- `OCR_PROVIDER=gemini` → Google Gemini vision, đọc được **cả** biển số, loại xe, hãng xe
- `OCR_PROVIDER=paddle` → microservice PaddleOCR tự host (`ocr-service/main.py`), **chỉ**
  đọc biển số; loại xe/hãng xe do nhân viên chọn trên UI
- Cấu hình cả hai → cái còn lại tự đỡ khi cái chính chết (dòng 257-258)
- **Không cấu hình gì → ném 503, KHÔNG có nhánh giả lập** (dòng 262-268)

**Kiểm tra ảnh trước khi gửi ra ngoài** (`parseImage:76`) — hàng rào bảo mật đáng khoe:

| Dòng | Kiểm tra |
|---|---|
| 81-88 | Phải là data URL đầy đủ |
| 91-97 | Chỉ jpeg/png/webp |
| 103-109 | Chặn theo độ dài **đã mã hoá** trước, tránh regex nổ với payload nhiều MB |
| 110-119 | Base64 hợp lệ (mã hoá lại để đối chiếu) |
| 121-127 | Giới hạn 3MB sau giải mã |
| 129-135 | **Magic byte phải khớp MIME đã khai** |

Dòng 129 là điểm mấu chốt: MIME do client khai nên client bịa được, còn byte đầu file thì
không. Có bước này thì file `.exe` đội lốt `image/jpeg` không bao giờ tới được provider.

Bộ test chứng minh: `tests/integration/security/scanGuard.test.js` — có hẳn ca
`'a %s payload is rejected without calling the provider'` khẳng định provider **không**
bị gọi khi payload xấu.

---

### 6.7 Thanh toán

**Ba đường tiền:**

| Đường | Nơi xử lý |
|---|---|
| Ví khách → phí gửi xe | `checkOut.service.js:396` |
| PayOS (QR ngân hàng) | `payment.service.js:135` (`initiatePayment`) |
| Tiền mặt tại quầy | ghi `Payment` trạng thái chờ, manager xác nhận — `buildingWallet.service.js:291` |

**PayOS đối soát 2 chiều:**
1. Webhook đẩy về → `src/services/payment/webhook.service.js` (xác minh chữ ký, sai thì
   từ chối — có log `PayOS webhook verification failed: Invalid signature`)
2. Chủ động hỏi lại → `verifySessionPayment` (`payment.service.js:288`)

Có 2 đường vì webhook có thể mất. `settleSessionPayment` (`payment.service.js:222`) là
điểm hợp nhất, và phải **idempotent** — webhook lẫn poll cùng gọi, không được ghi nhận
tiền hai lần.

**Chống tạo trùng phiên thanh toán**: `acquireSessionIntent` (`payment.service.js:97`) +
`isLiveSessionIntentConflict` (`payment.service.js:90`) — bấm nút hai lần không sinh ra
hai đơn PayOS.

**Ví tòa nhà** (`buildingWallet.service.js`): `credit:51` mọi khoản thu,
`debit:79` mọi khoản chi (hoàn tiền). Doanh thu ngày: `getDailyRevenue:122`.

---

### 6.8 Sự cố & phạt

Có **hai** đường tạo phiếu sự cố, luật khác nhau:

| Ai tạo | Service | Ràng buộc |
|---|---|---|
| Người gửi xe | `src/services/user/incident.service.js` — `createIncident:32` | **Phải đang có xe đỗ trong bãi** |
| Nhân viên | `src/services/staff/incident.service.js` | Theo ca trực và tòa được phân công |

**Luật "phải đang đỗ xe" (`ACTIVE_SESSION_REQUIRED`).** Người dùng chỉ báo được sự cố khi
có `ParkingSession` với `status: 'active'`. Một phiên **đã hoàn tất** hoặc một gói còn hạn
đều **không** đủ điều kiện.

Vì sao siết lại như vậy? Trước đây chỉ cần "từng gửi xe ở tòa này" là báo được, nghĩa là
người dùng mở được phiếu cho tòa nhà mà họ **không hề có mặt** — nhân viên không thể ra
kiểm chứng tại chỗ, và vụ việc có thể đã trôi qua nhiều tuần.

Hệ quả thiết kế: `building` và `slot` của phiếu được **suy ra từ chính phiên đang đỗ**,
không lấy theo giá trị client gửi lên. Đỗ nhiều xe cùng lúc thì client gửi `sessionId` để
chọn, và `sessionId` đó vẫn phải nằm trong danh sách phiên của **chính** người gọi.

Chặn thêm: không được khai **biển số xe của chính mình** là biển vi phạm
(`SELF_REPORTED_PLATE`).

**Bảng vi phạm do manager tự định nghĩa** cho tòa của mình:
`src/models/policy/ViolationType.js` + `src/services/manager/violationType.service.js`.
Đây là lựa chọn thiết kế: mỗi tòa nhà có nội quy riêng, hard-code danh sách vi phạm vào
code là sai mô hình kinh doanh. `type` của phiếu hợp lệ khi thuộc nhóm sự cố cố định
(`USER_INCIDENT_TYPES`) **hoặc** khớp `code` của một `ViolationType` đang `isActive` của
đúng tòa nhà đó.

Người báo cáo **không** thấy mức phí phạt (`fee`) — endpoint
`GET /api/users/buildings/:buildingId/violation-types` chỉ trả `_id`, `code`, `label`.
Mức phạt là thông tin nội bộ của manager/staff.

**Xử lý phiếu**: `src/services/shared/incidentResolve.service.js:148` —
`applyIncidentAction`, dùng chung cho cả staff lẫn manager. Tiền phạt được duyệt sẽ **treo**
trên phiên (`status: 'penalty_pending'` — `checkOut.service.js:37`) và thu tại cổng lúc xe ra.

Phiếu có biển vi phạm **không tra được chủ tài khoản** trong tòa sẽ tự động `escalated` —
staff không đủ thẩm quyền, phải để manager xử lý.

---

### 6.9 Ca làm việc

`Shift` (mẫu ca) và `StaffShift` (phân công cụ thể) là **hai model tách biệt** —
`src/models/operations/`.

`assertStaffHasActiveShift` (`entryAuthorization.service.js:35`) chặn nhân viên
check-in/check-out ngoài ca. Trả lời cho câu hỏi kiểm toán "ai cho xe này vào lúc 2 giờ
sáng?" — không có ca thì không thao tác được.

---

### 6.10 Kiosk tự phục vụ

`src/services/kiosk.service.js:54` — `selfCheckInByQr`. Khách có gói dài hạn quét QR xe
là tự vào, không cần nhân viên.

Bảo mật: `src/middlewares/kioskDevice.middleware.js` yêu cầu `KIOSK_DEVICE_TOKEN` — token
nạp sẵn trên từng máy kiosk, **cố ý không phải giá trị trình duyệt đọc được**. Máy kiosk
không có token thì không tạo được phiên gửi xe.

Kiosk và nhân viên dùng **chung** `resolveScannedQr` → luật hết hạn QR không thể lệch
nhau giữa hai đường quét.

---

## Phần 7 — Hướng dẫn code: thêm một chức năng mới

Làm đúng thứ tự này, không nhảy bước.

### Bước 1 — Model (nếu cần dữ liệu mới)

```js
// src/models/<nhóm>/TenModel.js
const mongoose = require('mongoose');

const tenModelSchema = new mongoose.Schema({
  building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  // ...
}, { timestamps: true });

// Ràng buộc nghiệp vụ nào ép được ở DB thì ép ở DB — đừng chỉ tin tầng service.
tenModelSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('TenModel', tenModelSchema);
```
Rồi export ở `src/models/<nhóm>/index.js` và `src/models/index.js`.

### Bước 2 — Service (toàn bộ logic nghiệp vụ)

```js
// src/services/<vai-trò>/tenChucNang.service.js
const AppError = require('../../utils/AppError');
const { TenModel } = require('../../models');

const create = async (user, payload) => {
  if (!payload.building) throw new AppError('building is required', 400, 'BUILDING_REQUIRED');
  // Chạm tới tiền hoặc ô đỗ → bọc trong transaction (xem longTerm.service.js:142)
  return TenModel.create({ ...payload, createdBy: user._id });
};

module.exports = { create };
```

Luật bất di bất dịch: **service không được biết `req` và `res`**. Nhận tham số thường,
trả dữ liệu thường, ném `AppError` khi sai.

### Bước 3 — Controller (mỏng)

```js
// src/controllers/<vai-trò>/tenChucNang.controller.js
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/<vai-trò>/tenChucNang.service');

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user, req.body);
  sendSuccess(res, { data });
});

module.exports = { create };
```

`asyncHandler` bọc để lỗi async tự chảy về `errorHandler` — **không** viết try/catch ở
controller.

### Bước 4 — Route + phân quyền

```js
// src/routes/<vai-trò>/tenChucNang.routes.js
const express = require('express');
const controller = require('../../controllers/<vai-trò>/tenChucNang.controller');
const { authorizeBuildingAccess } = require('../../middlewares/rbac.middleware');

const router = express.Router();
router.post('/', authorizeBuildingAccess, controller.create);
module.exports = router;
```
Gắn vào `src/routes/<vai-trò>/index.js`.

### Bước 5 — Swagger (BẮT BUỘC, có test chặn)

Thêm khối `@swagger` vào file `*.swagger.js` cùng thư mục. **Không làm là test đỏ**:
`tests/unit/swaggerDocumentation.test.js:74` khẳng định *mọi route đang mount đều phải có
tài liệu*, và dòng 80 khẳng định *không có tài liệu mồ côi*.

Tài liệu phải mô tả **đúng thứ backend thật sự trả về**. Đây không phải hình thức: PR #76
sửa đúng lỗi Swagger ghi `kind: [plate, user]` trong khi code trả `vehicle` — người viết
frontend đọc theo tài liệu và code hỏng suốt nhiều tuần mà không ai biết.

### Bước 6 — Test

```js
// tests/integration/<vai-trò>/tenChucNang.test.js
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const service = require('../../../src/services/<vai-trò>/tenChucNang.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

test('từ chối khi thiếu building', async () => {
  await expect(service.create(staff, {})).rejects.toMatchObject({ errorCode: 'BUILDING_REQUIRED' });
});
```

Chạy: `npm test` (688 test / 72 bộ, ~4-5 phút) hoặc `npx jest <đường-dẫn>` cho một file.
Test dùng `mongodb-memory-server` — không đụng vào database thật.

### Bước 7 — Cập nhật tài liệu này

Thêm dòng vào bảng tra cứu **Phần 5**. Tài liệu sai còn nguy hiểm hơn không có tài liệu.

Sửa **file Markdown** `docs/NGHIEP_VU_BACKEND.md` (nguồn), rồi xuất lại bản Word:

```bash
pip install python-docx                    # chỉ cần một lần
python docs/export-to-docx.py              # → ../docs/PBMS_Tai_Lieu_Nghiep_Vu_Backend.docx
```

Đóng file `.docx` trong Word trước khi chạy, nếu không sẽ báo `Permission denied`.

**Không sửa thẳng vào `.docx`** — lần xuất kế tiếp sẽ ghi đè và mất hết.

Hai lưu ý khi viết Markdown cho bộ xuất này:

- Đừng lồng định dạng vào nhau (`*nghiêng **đậm** nghiêng*`) — bộ xuất không hiểu lồng
  và sẽ in ra nguyên dấu sao.
- Ngắt dòng cứng giữa đoạn văn thì không sao (bộ xuất tự gộp lại), nhưng **bảng** thì mỗi
  hàng phải nằm trọn trên một dòng.

---

## Phần 8 — Câu hỏi giảng viên hay hỏi

| Câu hỏi | Trả lời ngắn | Chỉ vào đâu |
|---|---|---|
| Chống đặt trùng ô đỗ thế nào? | Cập nhật có điều kiện ở tầng DB, không đọc-rồi-ghi | `checkIn.service.js:80` + unique index |
| Sao không để ví âm được? | `$gte: fee` nằm ngay trong câu update | `checkOut.service.js:396-397` |
| Tính phí cao điểm ra sao? | Tách phút peak/regular, cộng riêng từng khung | `feeEngine.js:59-125` |
| Khung cao điểm qua nửa đêm? | Có xử lý riêng | `feeEngine.js:41-46` |
| Token để đâu? | Cookie httpOnly, không phải localStorage | `utils/authCookie.js` |
| Nhân viên tòa A xem được tòa B không? | Không | `rbac.middleware.js:29-70` |
| Admin sửa được tòa nhà không? | Không — admin chỉ đọc, có chủ đích | `rbac.middleware.js:78-89` |
| Ảnh camera có bị lợi dụng không? | Đối chiếu magic byte trước khi gửi ra provider | `visionScan.service.js:129-135` |
| Camera hỏng thì cổng đứng à? | Không, trả 200 + `scanStatus: unavailable` để nhập tay | `query.service.js:314-330` |
| Webhook thanh toán mất thì sao? | Có đường đối soát chủ động | `payment.service.js:288` |
| Hạn mức gói tính theo lượt hay theo ngày? | Theo ngày dương lịch, gộp mọi phiên trong ngày | `longTermUsage.js:28-91` |
| Tòa chưa cấu hình giá thì tính sao? | Chặn check-out, không cho miễn phí ngầm | `feeEngine.js:57` |
| Ai được báo cáo sự cố? | Chỉ người **đang có xe đỗ**; building suy từ phiên, không tin client | `user/incident.service.js:32` |
| Có bao nhiêu test? | 688 test / 72 bộ, có test chặn Swagger lệch | `npm test` |

**Nhóm câu hỏi về kỹ thuật (hay hỏi để kiểm tra hiểu bài, không phải hỏi nghiệp vụ):**

| Câu hỏi | Trả lời ngắn | Mục |
|---|---|---|
| `async/await` để làm gì? | Node chạy 1 luồng; `await` nhường CPU cho request khác trong lúc chờ I/O, không đứng cả server | 1.1 – 1.3 |
| `await` có làm chậm server không? | Không. Nó chỉ dừng **hàm đang chạy**, không dừng event loop | 1.3 |
| Quên `await` thì sao? | Nhận về Promise thay vì dữ liệu, **không báo lỗi** — bug im lặng | 1.3 |
| Nhiều truy vấn độc lập thì làm sao cho nhanh? | `Promise.all` chạy song song thay vì `await` lần lượt | 1.3 |
| `next()` làm gì? | Chuyển sang middleware kế tiếp; `next(err)` nhảy thẳng tới handler lỗi | 1.5 |
| Vì sao controller không có `try/catch`? | `asyncHandler` bọc sẵn, `.catch(next)` đẩy lỗi về một chỗ | 1.6 |
| Vì sao cần `errorCode` khi đã có `message`? | `message` cho người đọc và đổi được; `errorCode` cho máy (FE + test) so khớp | 1.7 |
| Một request đi qua những gì? | app.js → routes → middleware → controller → service → model → DB | Phần 2 |
| Kết nối DB mở lúc nào? | Một lần lúc khởi động; sau đó dùng connection pool | 3.3 |
| Transaction dùng khi nào? | Mọi thao tác chạm tiền hoặc trạng thái ô đỗ | 3.7 |
| Chống race condition kiểu gì? | Điều kiện nằm trong chính câu update + unique index | 3.6, 3.8 |
| `.lean()` là gì? | Trả object JS thuần, nhẹ hơn, nhưng **không** `.save()` được | 3.5 |
| Test có đụng DB thật không? | Không — `mongodb-memory-server`, xoá sạch trước mỗi test | 3.9 |

---

## Phần 9 — Lệnh hay dùng

```bash
npm run dev                    # chạy dev (nodemon)
npm run dev:memory             # chạy với MongoDB in-memory, không cần Atlas
npm test                       # 688 test / 72 bộ
npx jest tests/unit/swaggerDocumentation.test.js   # chỉ kiểm tra Swagger
npm run audit:business-logic   # rà soát bất biến nghiệp vụ (dry-run)
npm run migrate:vehicles:dry   # xem trước migration Vehicle
npm run migrate:vehicles       # chạy migration (BẮT BUỘC 1 lần mỗi database)
```

Swagger UI: chạy server rồi mở `/api-docs`.
