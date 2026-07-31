# PBMS Backend — System Design

Parking Building Management System (PBMS) — REST API cho 4 vai trò:
**user** (khách gửi xe), **staff** (nhân viên bảo vệ/cổng), **manager** (người vận
hành các bãi được giao), **admin** (chủ hệ thống/đơn vị mua PBMS).

- **Admin** quản trị toàn nền tảng: tòa nhà, tài khoản, phân công nhân sự, báo cáo
  tài chính hợp nhất, đối soát và audit. Admin không check-in/check-out hoặc xác
  nhận tiền mặt thay Manager.
- **Manager** cấu hình và chịu trách nhiệm vận hành/tài chính các bãi được giao.
- **Staff** làm nghiệp vụ vật lý tại cổng trong ca được giao.
- **User** sử dụng dịch vụ và chỉ truy cập dữ liệu cá nhân.

Ma trận quyền chuẩn được expose tại `GET /api/admin/governance/roles`.

Stack: **Node.js + Express 4**, **MongoDB Atlas + Mongoose 8** (transactions),
**JWT** (auth, cookie hoặc Bearer header), **PayOS** (cổng thanh toán, `@payos/node`),
**Nodemailer** (email OTP/thông báo, Gmail SMTP), **swagger-jsdoc + swagger-ui-express**
(API docs tại `/api-docs`), **express-rate-limit** (chống brute-force auth/reset),
**Jest + mongodb-memory-server + supertest** (test, `MongoMemoryReplSet` cho các luồng
cần transaction).

---

## 1. Kiến trúc phân lớp

```
routes/       (khai báo endpoint + swagger JSDoc)   admin/ manager/ staff/ user/ payment/ kiosk.routes.js
   │  gắn middleware theo thứ tự: authenticate → authorize/authorizeBuildingAccess
   │  → validator → controller  (sanitizeInputs + rate-limit áp toàn cục ở app.js)
   ▼
controllers/  (đọc req, gọi đúng 1 service, trả response chuẩn qua utils/response — không chứa nghiệp vụ)
   ▼
services/     (TOÀN BỘ business logic — theo role/domain)
   │            admin/ manager/ staff/ user/ payment/ kiosk.service.js
   │            shared/  (incidentResolve — dùng chung staff PATCH & manager PATCH incident)
   │            staff/parkingSession/  (checkIn, checkOut, query, helpers — tách vì file gốc quá dài)
   ▼
models/       (Mongoose schema theo domain, re-export qua models/index.js)
   building/   Building · Floor · Zone · ParkingSlot · Gate · VehicleType · BuildingManager
   operations/ ParkingSession · Shift · StaffShift · Feedback
   policy/     PricePolicy · ReservationPolicy (chỉ còn refundPercent) · ViolationType (bảng giá phạt/loại vi phạm, per building) · LongTermPackage · LongTermSubscription
   finance/    Payment · WalletTransaction · BuildingWallet · BuildingWalletTransaction
   log/        AuditLog · Incident · Notification
   user/       User · OtpVerification

validators/   input validation theo role (admin/manager/staff/user/auth/adminUsers/incident) — chạy trước controller
middlewares/  auth (JWT cookie/Bearer) · rbac (authorize/authorizeBuildingAccess/readOnlyForAdmin) ·
              sanitize (chặn NoSQL injection) · rateLimiter · error (notFound/errorHandler)
repositories/ building.repository.js — data-access dùng chung (populate manager) tách khỏi service
constants/    roles · pricing (DEFAULT_HOURLY_RATE fallback)
config/       env (đọc + validate .env) · db (kết nối Mongoose) · swagger (swagger-jsdoc setup)
docs/         swagger.paths.js — định nghĩa components/schemas dùng chung (không gắn với 1 route file nào)
jobs/         subscriptionExpiry (mỗi giờ) — có jobLock chống chạy trùng đa instance
utils/        feeEngine · refundPolicy · dateBucket (bucket theo giờ local) · plate.util ·
              staffScope/managerScope (scope theo building + audit log) · email · codeFromName · …
scripts/      one-off vận hành, chạy tay (wipeData, releasePackageSlots) — không phải cron
```

**Quy tắc:** logic tiền bạc/thay đổi nhiều document luôn nằm trong
`mongoose.startSession().withTransaction()` (đòi hỏi MongoDB replica set, kể cả lúc test —
xem `tests/helpers/db.js::MongoMemoryReplSet`); mọi thao tác nhạy cảm ghi `AuditLog`
(qua `staffScope.logAudit`).

## 2. Domain model & bất biến nghiệp vụ

### Slot & Zone
- `Zone.usageType` ∈ `walk_in | registered | subscriber | reserved` — denormalize
  xuống `ParkingSlot.usageType`. Slot không gắn zone (`usageType = null`) là slot
  **vạn năng** (mọi loại xe/đối tượng).
- Chuỗi fallback MỘT CHIỀU (`helpers.acceptableUsageTypes`): hội viên gói được
  dùng slot chung, nhưng **walk-in không bao giờ chiếm slot subscriber/reserved**.
- `findCompatibleSlots` (gợi ý tự động) và `isSlotUsageCompatible` (chọn tay) dùng
  chung ngữ nghĩa — kể cả slot `null` (vạn năng).

### Đặt chỗ trước theo giờ (advance hourly reservation) — ĐÃ XOÁ HẲN
Tính năng đặt chỗ trước theo khung giờ (deposit, cutoff, no-show expiry qua
`reservationLifecycle.service`, job `reservationExpiry`) đã bị **xoá hoàn toàn**
khỏi codebase ở commit `0fe4bad` (2026-07-16) — không còn model `Reservation`,
route, service, job, validator, hay test nào liên quan. Thay thế bằng long-term
package có thể giữ slot cố định (xem mục dưới). `ReservationPolicy` model **vẫn
còn** nhưng chỉ giữ `refundPercent` — mức phạt vi phạm đã tách sang model riêng
`ViolationType` (xem mục "Sự cố & phạt vi phạm" bên dưới).
Đợt audit 2026-07-22 (Phase 2) phát hiện tài liệu + FE/Mobile vẫn còn gọi/mô tả
tính năng này như đang sống dù đã xoá 6 ngày trước đó — đã dọn sạch FE (xoá
`ReservationsPage`/`StaffReservationsPage`/`userApi.reservations.*`) và Mobile
(xoá chế độ `bookingType:'hourly'` khỏi `useReservations`, giữ lại mua gói).

Đợt dọn 2026-07-29 gỡ nốt phần "trôi" còn lại trên cả 3 repo: swagger tag
`User/Staff - Reservations` + `Manager - Reservation Policy` (không route nào
dùng), nhóm doanh thu `bySource.reservation` (thay bằng `bySource.other`), các
field FE đã chết (`activeReservation`/`isReservation`/`reservationRemainingFee`),
nhánh check-in `checkInKind:'reservation'`, tab + route `reservations` của Mobile.
**Chỉ còn 3 luồng khách hàng**: gửi xe vãng lai · gửi xe có tài khoản (không gói)
· gói dài hạn (slot floating hoặc slot cố định).

**Giữ lại có chủ đích (tương thích dữ liệu LỊCH SỬ, không phải tính năng)**:
`Payment.type='reservation'`, `BuildingWalletTransaction.reason='reservation_fee'`,
collection `reservation_policies` + model `ReservationPolicy` (nay là refund policy
của gói), audit action `*_RESERVATION`. Xoá enum chỉ được phép sau khi
`src/scripts/auditLegacyReservationPayments.js` trả về 0 ở mọi môi trường thật.

### Long-term package (gói dài hạn)
- **Mặc định floating** (không giữ slot cố định); staff/hệ thống gán slot trống
  dãy `subscriber` lúc check-in. Hết bãi → gói cũng bị chặn theo capacity (không
  còn bypass).
- **Tuỳ chọn giữ slot cố định lúc đăng ký** (`subscribe(..., slotId)`,
  `services/user/longTerm.service.js`): nếu client gửi kèm `slotId` hợp lệ (cùng
  building, `usageType:'subscriber'`, còn `available`, đúng vehicleType) → claim
  slot đó ngay (chuyển `reserved`), lưu vào `Subscription.slot`; check-in sau đó
  tự nhận đúng slot đã giữ. Đây là cơ chế thay thế cho reservation theo giờ đã bỏ.
- **Loại xe của GÓI (`package.vehicleType`) là nguồn sự thật lúc vào bãi** — cả
  check-in staff lẫn kiosk QR: dùng để validate dãy, chọn slot floating, validate
  slot staff chọn tay và gán `ParkingSession.vehicleType`. Loại xe camera nhận
  diện / client gửi lên chỉ là dữ liệu hỗ trợ; khác NHÓM (xe máy = `motorcycle`,
  `ebike`, `emotorbike`; ô tô = phần còn lại) → 409 `PACKAGE_VEHICLE_TYPE_MISMATCH`,
  `forceCheckIn` KHÔNG bỏ qua được.
- 1 biển số chỉ có tối đa 1 gói `active` cùng lúc (unique partial index DB-level
  trên `plateNumber` khi `status:'active'` — gói `pending/cancelled/expired` không
  bị tính nên vẫn mua lại được sau khi hủy/hết hạn).
- Miễn phí trong `maxHoursPerDay`/ngày (cộng dồn theo ngày — `longTermUsage`);
  phần vượt tính theo PricePolicy thường, có chặn khai thác qua nửa đêm.
- Hủy trong 3 ngày từ `startDate`, hoàn `refundPercent`% (fallback 80% khi building
  chưa có ReservationPolicy — có test chốt hành vi này, xem `utils/refundPolicy.js`);
  gia hạn cộng dồn từ `endDate`, cho phép trễ ≤ 7 ngày. Hủy nhả slot cố định
  (nếu có) về `available`.


### Sự cố & phạt vi phạm (Incident + ViolationType) — thêm 2026-07-24
- User báo cáo sự cố (`POST /users/incidents`) với `type` là 1 trong 2 nhóm:
  nhóm cố định "tự thân" (`vehicle_damaged`, `facility_issue`, `wrong_scan`,
  `payment_dispute`, `security`, `other` — không liên quan tới phạt), HOẶC `code`
  của 1 `ViolationType` **do manager tự cấu hình cho building đó** (bảng giá phạt
  vi phạm, không hard code trong code — vd `wrong_spot`, `slot_occupied`). `type`
  không khớp cả 2 nhóm → 400 `INVALID_INCIDENT_TYPE`.
- `ViolationType` (`services/manager/violationType.service.js`,
  `GET/POST/PUT/DELETE /manager/buildings/:id/violation-types`): mỗi violation
  type là 1 cặp `{ code, label, fee }` per building — manager thêm/sửa/xoá tự do.
  Lần đầu gọi `list()` cho 1 building chưa có type nào → tự seed 6 loại phổ biến
  (`DEFAULT_VIOLATION_TYPES`) làm điểm khởi đầu, KHÔNG phải giá trị cố định vĩnh
  viễn. Endpoint đọc phía user (`GET /users/buildings/:id/violation-types`) chỉ
  trả `code`/`label` — **không trả `fee`** (phí là thông tin nội bộ manager/staff).
- Kèm `violatorPlate` (biển xe vi phạm) → `findPlateAccountInBuilding` tự tra xem
  biển đó có subscription active hoặc parking session gắn user trong building
  không. KHÔNG tìm thấy (biển lạ/khách vãng lai không tài khoản) → incident tự
  chuyển `escalated`, **chỉ manager/admin xử lý được** (staff chỉ xem — thiếu
  thẩm quyền, tránh staff tự ý phạt biển không rõ chủ).
- Duyệt phạt (`action:'penalize_violator'`, chỉ manager/admin,
  `incidentResolve.service.js`): mức phí **bị ép theo `ViolationType.fee`** khớp
  `incident.type` cho building đó — **manager không được ghi đè** bằng
  `penaltyFee` tuỳ ý gửi lên (chặn set phí quá cao/tuỳ tiện). Chỉ khi
  `type==='other'` (hoặc incident cũ không còn khớp type nào trong bảng giá —
  vd đã bị xoá) mới bắt buộc/cho phép manager nhập `penaltyFee` thủ công (400
  `PENALTY_FEE_REQUIRED` nếu thiếu). Duyệt phạt chỉ **ghi nhận** (`status`
  chuyển `penalty_pending`) — CHƯA thu tiền, chưa cần xe đang đỗ trong bãi.
- Thu tiền thật xảy ra tự động lúc xe đó **check-out** (bất kể qua camera scan
  hay nhập tay — cùng 1 code path `staff/parkingSession/checkOut.service.js`,
  không có luồng riêng): `settlePendingPenaltyAtCheckout` khớp biển số + building
  đang có incident `penalty_pending` → tạo `Payment` RIÊNG (tách khỏi phí gửi
  xe) theo phương thức staff/khách chọn lúc đó (cash → `pending` chờ manager
  "Thu nhận"; wallet → trừ ví ngay, yêu cầu phiên có `user` liên kết — khách
  vãng lai không tài khoản dùng wallet sẽ bị chặn `NO_WALLET_ACCOUNT`, phải
  chuyển cash) → incident chuyển `resolved`. Phí gửi xe và phí phạt là HAI khoản
  thu riêng nên được phép khác phương thức: `penaltyPaymentMethod` (chỉ
  `cash`/`wallet`) trong body check-out chỉ định riêng cách thu phạt, mặc định
  theo `paymentMethod` của lượt check-out. Khi phí gửi xe đã trả qua QR PayOS mà
  phạt được duyệt SAU lúc tạo QR (QR chỉ chứa phí gửi xe), `penaltyPaymentMethod`
  là BẮT BUỘC — thiếu → 400 `PENALTY_PAYMENT_METHOD_REQUIRED`, sai giá trị → 400
  `INVALID_PENALTY_PAYMENT_METHOD`, không thu nửa vời (tạo QR khi ĐÃ có phạt vẫn
  bị chặn như cũ). `penalty_pending` không cho đổi
  status thủ công (tránh mất dấu khoản phạt chưa thu) và không cho duyệt phạt
  lại trên incident đã `resolved/closed` (tránh double-charge biển số).

### Check-in / Check-out (staff)
- Staff phải có **ca hôm nay** (`StaffShift`) tại building; checkout chấp nhận ca
  hôm qua (xe qua đêm). Building có `operatingHours` thì chặn ngoài giờ.
- Ảnh **chân dung bắt buộc mọi check-in** (đối chiếu người lấy xe); khách vãng lai
  thêm ảnh **biển số** (`PLATE_IMAGE_REQUIRED`). Gói định danh bằng quét.
- Slot staff chọn phải thuộc đúng building (cả luồng gói lẫn walk-in).
- Checkout: gói dài hạn miễn phí trong `maxHoursPerDay`/ngày (cộng dồn — chặn khai
  thác qua nửa đêm bằng 1 phiên dài); phần vượt tính theo `PricePolicy` thường
  (peak/regular tách theo phút, `utils/feeEngine`) — không có hệ số phạt overstay
  riêng, phần vượt tính đúng bằng giá vãng lai bình thường.
- Fee fallback khi building chưa có PricePolicy: `DEFAULT_HOURLY_RATE` theo loại xe
  (`constants/pricing.js`).

### Tiền & doanh thu
- **`Payment` là nguồn sự thật duy nhất của doanh thu** (model ShiftRevenue đã xóa).
  Mọi dòng tiền: `WalletTransaction` (ví user, audit) + `Payment` + credit/debit
  `BuildingWallet` (`BuildingWalletTransaction`). Refund dùng `allowNegative` để ví
  tòa nhà có thể âm khi hoàn tiền.
- Báo cáo tách `grossRevenue` (đã thu) − `refunds` = `netRevenue`;
  `pendingCash` là tiền Staff ghi nhận nhưng Manager chưa xác nhận bàn giao;
  `walletFunding/topup` là luân chuyển vốn, không phải doanh thu. Phí phạt dùng
  loại `penalty`, không trộn với phí gửi xe.
- Doanh thu ghi nhận theo `Payment.settledAt`; dữ liệu cũ fallback về `createdAt`.
- Admin dùng `GET /api/admin/revenue`, `/transactions` và `/reconciliation` để
  xem báo cáo hợp nhất, sổ giao dịch và bất thường cần đối soát.
- PayOS: webhook (`payment/webhook.controller`) verify chữ ký → settle theo
  `payosOrderCode` (idempotent, race-safe, dùng chung code với endpoint verify tay).

## 3. Jobs định kỳ
| Job | Chu kỳ | Việc |
|---|---|---|
| `subscriptionExpiry` | 1 giờ | nhắc hạn 7/5/3/1 ngày (`remindersSent`); active→expired + notify |

Dùng `jobLock` (khóa TTL trong Mongo) chống chạy trùng đa instance; email
best-effort (lỗi SMTP không rollback nghiệp vụ).

## 4. AuthN / AuthZ
- JWT chấp nhận **cả 2 dạng**: httpOnly cookie `pbms_token` (set bởi
  register/register-verify/login, xoá bởi `POST /users/auth/logout` — dùng cho FE
  web, tránh lưu token ở localStorage) HOẶC header `Authorization: Bearer` (Mobile,
  không có cookie jar). `auth.middleware` thử cookie trước, fallback header.
  `app.js` dùng CORS origin allowlist (`CLIENT_URL`, phân tách bởi dấu phẩy nếu
  nhiều origin) + `credentials:true` — bắt buộc để cookie qua được cross-origin.
- RBAC theo role (`rbac.middleware`): `authorize(...roles)`, `authorizeBuildingAccess`
  (admin bypass, staff không kèm buildingId vẫn qua nếu có assignment, còn lại phải
  khớp toà được gán), `readOnlyForAdmin` (admin chỉ GET cấu hình toà).
- Scope dữ liệu: staff bị giới hạn `assignedBuildings` (`staffScope.assertBuildingScope`),
  manager theo `managerScope`. Lockout đăng nhập sai nhiều lần + phone unique ở BE.
- OTP đăng ký + reset password qua email (`utils/email`, templates dùng chung layout).
- `middlewares/sanitize.middleware.js` (áp toàn cục ở `app.js`, trước mọi route) strip
  key bắt đầu bằng `$` hoặc chứa dấu `.` khỏi `body/query/params` — chặn NoSQL injection
  kiểu `?building[$ne]=null` (Express `qs` parse query thành object lồng nhau).
- `express-rate-limit`: `authLimiter` (20 req/15 phút) trên register/login,
  `passwordResetLimiter` (5 req/1 giờ) trên forgot/reset-password.

> ⚠️ Lưu ý môi trường dev Windows: Windows Defender từng false-positive
> (`Trojan:Script/ObfusScript.A!ml`) và **xóa `src/utils/email.js`** làm server
> không khởi động. File đã được viết lại theo cấu trúc khác để không còn bị flag;
> nếu tái diễn, thêm exclusion cho thư mục dự án.

## 5. Test (`tests/`)
- `unit/` + gốc (`fee`, `plate`, `usage`, `flows`, `subscribe`, `jobs`,
  `payos`) — service-level với mongodb-memory-server.
- `integration/` theo vai trò (admin/manager/staff/user) — gọi service như controller.
- `system/lifecycle.e2e.test.js` — supertest qua HTTP đầy đủ vòng đời.
- Chạy: `npm test` (jest `--runInBand`). Test là **spec hành vi tiền bạc** — sửa
  logic refund/fee phải cập nhật test tương ứng trong cùng PR.


## 6. Chạy dự án local

```bash
npm install
cp .env.example .env   # rồi điền giá trị thật (xem bảng biến môi trường bên dưới)
npm run dev             # nodemon --watch src --ext js,json src/server.js — reload khi sửa src/
```

Server mặc định lắng nghe `PORT` (default `5000`); `GET /` trả JSON chào; Swagger UI
tại `http://localhost:<PORT>/api-docs` (spec thô ở `/api-docs.json`).

**Biến môi trường** (`src/config/env.js` throw lỗi ngay lúc start nếu thiếu biến
BẮT BUỘC — xem `.env.example` để có mô tả đầy đủ từng biến):

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `MONGODB_URI` | ✅ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✅ | Ký JWT |
| `PAYOS_CLIENT_ID` / `PAYOS_API_KEY` / `PAYOS_CHECKSUM_KEY` | ✅ | PayOS (my.payos.vn) |
| `PORT` | – | default `5000` |
| `JWT_EXPIRES_IN` | – | default `7d`; cũng set `maxAge` của cookie `pbms_token` |
| `CLIENT_URL` | – | default `http://localhost:5173`; CORS allowlist, phân tách `,` nếu nhiều origin (FE web + tool khác) |
| `EMAIL_USER` / `EMAIL_PASS` | – | Nodemailer Gmail SMTP (OTP/email thông báo); dùng App Password |
| `GEMINI_API_KEY` | – | AI camera nhận diện biển số/hãng xe; thiếu → `/scan` trả 503 |
| `OCR_PROVIDER` | – | `gemini` \| `paddle`; bỏ trống tự chọn theo biến nào có sẵn |
| `PADDLE_OCR_URL` | – | URL microservice PaddleOCR tự host (xem `ocr-service/README.md`) |

**Chạy MongoDB in-memory (không cần Atlas)**: `npm run dev:memory`
(`tools/run-dev-memory-db.js`) — dựng `mongodb-memory-server` local (standalone, không
phải replica set nên các luồng dùng transaction sẽ lỗi — chỉ tiện để nghịch nhanh các
endpoint đọc-nhiều hoặc Swagger UI mà không cần Atlas) rồi start server. Dữ liệu mất
khi tắt process. **Lưu ý**: `tools/` nằm trong `.gitignore` — file này không nằm trong
repo, mỗi dev tự tạo cục bộ nếu muốn dùng (nội dung script ở trên).

**Test**: `npm test` (= `jest --runInBand`, chạy tuần tự vì nhiều test dùng
`MongoMemoryReplSet` chung transaction). Không cần `.env` thật — `tests/helpers/setEnv.js`
tự set biến môi trường giả trước khi nạp `config/env`.

## 7. Build & chạy production

Không có bước build (không TypeScript/bundler) — `npm start` chạy thẳng
`node src/server.js`. Checklist deploy:
1. `npm install --omit=dev` (hoặc `npm ci`) trên máy/container đích.
2. Set đủ biến môi trường bắt buộc ở mục 6 (đặc biệt `NODE_ENV=production` —
   ảnh hưởng cookie `secure`/`sameSite`, xem `utils/authCookie.js`) qua biến môi
   trường thật của platform (Render/Railway/VPS…), **không** commit `.env`.
3. `CLIENT_URL` phải là (các) origin thật của FE production, không phải localhost.
4. `npm start`.
5. MongoDB Atlas + PayOS phải là project/kênh thanh toán **production**, không
   phải sandbox/dev, trước khi nhận thanh toán thật.

> Nhánh này (`chore/full-review-2026-07`) là một đợt rà soát chất lượng trước
> triển khai — không tự động deploy, quyết định thời điểm đi production do chủ dự
> án quyết định riêng.

## 8. Thư mục khác
- `openspec/` — quy trình OpenSpec cho thay đổi hành vi/nghiệp vụ (`propose` →
  `apply` → `archive`), `openspec/specs/` là nguồn spec đã chốt, `openspec/config.yaml`
  giữ bối cảnh dự án khớp CLAUDE.md.
- `ocr-service/` — microservice PaddleOCR tự host tuỳ chọn (thay thế Gemini cho
  nhận diện biển số), xem README riêng trong thư mục.
- `tools/` — **gitignore toàn bộ**, script hỗ trợ dev cá nhân (vd `run-dev-memory-db.js`
  cho `npm run dev:memory`, xem mục 6) không nằm trong repo.
- `src/scripts/` — script vận hành one-off chạy tay (`wipeData.js`,
  `releasePackageSlots.js`), không phải cron job.

## 9. Nợ kỹ thuật / hướng cải thiện
1. `docs/swagger.paths.js` + các file `*.swagger.js` (rải theo từng role, tổng
   ~2k dòng, đã rà lại 100% route ↔ swagger 2026-07-24) — cân nhắc sinh từ JSDoc
   tự động hoặc tách nhỏ hơn nữa để đỡ trôi so với route thật theo thời gian.
2. **Báo cáo cuối ca + doanh thu ca staff chưa merge**: đang nằm trong `git
   stash@{0}` trên nhánh riêng `feat/zone-validation-and-revenue-reporting`
   (WIP) — code thực tế (`submitShiftReport`, `listShiftReportSubmissions`,
   `my-shift-revenue`) chưa có trên `dev`. FE đã tạm ẩn UI liên quan.
3. Chuẩn hóa fallback `refundPercent` (default 80, `utils/refundPolicy.js`) —
   đưa về bắt buộc có `ReservationPolicy` khi seed building mới để bỏ fallback.
4. Không có endpoint user-facing (Mobile) đọc `refundPercent` của building trước
   khi hủy gói — Mobile hiện dùng default cứng 80 khi hỏi API cũ (đã xoá) thất
   bại; nếu cần chính xác hơn thì phải thêm route user mới hoặc mở rộng
   `GET /users/long-term/subscriptions` trả kèm policy.
5. `CLAUDE.md` mô tả một số việc ("Audit toàn diện 2026-07-22": sanitize
   middleware chống NoSQL injection, gap test coverage cho webhook/kiosk/admin
   building CRUD, UTC-vs-local revenue bucketing) như đã xong trên `dev`, nhưng
   commit thực tế nằm trên nhánh `chore/full-audit-2026-07` — **chưa từng được
   merge vào `dev`** trước đợt rà soát này. Đã cherry-pick 4 commit liên quan
   (không đụng tới commit đổi sang cookie auth, vì đó là thay đổi hành vi cần
   xem xét riêng) vào nhánh `chore/full-review-2026-07`; nhánh audit cũ vẫn còn
   tồn tại, cân nhắc xoá sau khi xác nhận không còn gì cần lấy thêm từ đó.


