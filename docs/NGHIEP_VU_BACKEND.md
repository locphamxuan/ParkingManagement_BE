# PBMS Backend — Tài liệu chức năng nghiệp vụ

Tài liệu này trả lời đúng một câu hỏi: **"Nghiệp vụ X nằm ở đâu trong code?"**

Phạm vi: **chỉ Backend** (`ParkingManagement_BE`). Frontend không nằm trong tài liệu này.

> **Về số dòng.** Số dòng là chỉ dẫn nhanh, sẽ trôi khi code thay đổi. **Tên hàm mới là
> mỏ neo thật.** Không tìm thấy ở dòng đã ghi thì tra bằng tên hàm:
> `grep -rn "const tenHam" src/`. Tài liệu này nằm trong repo BE chính vì lý do đó —
> sửa code thì sửa luôn tài liệu trong cùng một commit.
>
> Chốt tại: `main`, sau khi merge PR #76 (2026-08-01).

---

## Phần 1 — Lý thuyết & nguyên tắc thiết kế đã áp dụng

Đây là phần giảng viên hay hỏi trước khi hỏi tới code: *"Các em áp dụng cái gì?"*

### 1.1 Kiến trúc phân tầng (Layered Architecture)

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

### 1.2 RBAC — phân quyền theo vai trò

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

### 1.3 Giao dịch ACID cho tiền và ô đỗ

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

### 1.4 Một nguồn sự thật (Single Source of Truth)

Nguyên tắc được áp dụng lặp lại, mỗi lần đều để sửa một lỗi trôi lệch có thật:

| Khái niệm | Nguồn duy nhất | Trước đây sai thế nào |
|---|---|---|
| Thể loại xe | `src/constants/vehicle.js:19-27` | Danh sách bị chép 3 nơi, User có 7 giá trị mà validator chỉ cho 5 |
| Doanh thu | model `Payment` | Từng có model `ShiftRevenue` song song, hai bên lệch số |
| % hoàn tiền huỷ gói | `src/utils/refundPolicy.js:19-25` | Mỗi luồng huỷ có default riêng → hứa 80% mà trả 0đ |
| Hạn QR phương tiện | `env.vehicleQrTtlDays` | Nếu để mỗi tòa tự đặt, một xe đi 3 tòa sẽ có 3 hạn mâu thuẫn |
| "Gói còn hiệu lực" | `activeSubscriptionMatch()` — `helpers.js:131` | Màn hình quét và lúc check-in xét khác nhau |

### 1.5 Chuẩn hoá dữ liệu đầu vào

Biển số được đưa về **dạng canonical** `59G2-038.80` ngay tại cửa ngõ, ở mọi luồng.
`src/utils/plate.util.js` → `normalizePlate`. Không có bước này thì `59G2-81000` và
`59G2-810.00` là hai xe khác nhau trong DB.

`plateCore` (`src/models/vehicle/Vehicle.js`) là khoá tra cứu đã bỏ hết dấu phân cách —
dùng cho unique index, để không phụ thuộc cách người dùng gõ.

### 1.6 An toàn theo chiều sâu (Defense in Depth)

Một quy tắc nghiệp vụ được chặn ở **nhiều tầng**, không tin tầng nào duy nhất:

Ví dụ luật "thể loại xe phải khớp sê-ri biển số":
1. FE cảnh báo sớm khi gõ (`utils/plate.ts` bên FE)
2. Validator chặn lúc tạo (`src/utils/vehicleRules.js:18-29`)
3. Service chặn lúc đổi thể loại (cùng hàm trên, gọi lại)
4. Index DB chặn trùng biển

### 1.7 Suy giảm có kiểm soát (Graceful Degradation)

Camera AI chết **không được** làm liệt cả cổng vào.
`src/services/staff/parkingSession/query.service.js:314-330`: provider OCR hỏng thì trả
**HTTP 200** kèm `scanStatus: 'unavailable'` và biển số rỗng, để nhân viên nhập tay.
Chỉ payload sai định dạng mới là lỗi 4xx thật.

---

## Phần 2 — Bản đồ tra cứu nhanh

Giảng viên hỏi chức năng nào, mở đúng dòng này:

| Nghiệp vụ | File | Hàm : dòng |
|---|---|---|
| **Đăng ký tài khoản (OTP 2 bước)** | `src/services/auth.service.js` | `requestRegistration:148`, `verifyOtpAndRegister:180` |
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
| **Sự cố + phạt** | `src/services/shared/incidentResolve.service.js` | `applyIncidentAction:148`, `settlePendingPenaltyAtCheckout:45` |
| **Vòng đời ô đỗ** | `src/services/shared/slotLifecycle.service.js` | `occupyFixedSlotForCheckIn:126`, `finalizeSlotAfterCheckout:163` |
| **Gói hết hạn tự động** | `src/services/shared/slotLifecycle.service.js` | `expireStaleSubscriptions:47` + `src/jobs/subscriptionExpiry.job.js` |
| **Ca làm việc (gating)** | `src/services/shared/entryAuthorization.service.js` | `assertStaffHasActiveShift:35` |
| **Kiosk tự check-in** | `src/services/kiosk.service.js` | `selfCheckInByQr:54` |
| **Cấu hình tòa nhà** | `src/services/manager/` | `floor/zone/slot/gate/vehicleType/pricing/package.service.js` |
| **Doanh thu admin** | `src/services/admin/revenue.service.js` | toàn file |
| **Nhật ký kiểm toán** | `src/utils/audit.js` + `src/models/log/AuditLog.js` | — |

---

## Phần 3 — Chi tiết từng nghiệp vụ

### 3.1 Xác thực & tài khoản

**Đăng ký là quy trình 2 bước, cố ý.** Không có endpoint "đăng ký thẳng".

```
POST /api/users/auth/register/request   → requestRegistration()  auth.service.js:148
   ├─ tạo OtpVerification, hash OTP bằng SHA-256 (auth.service.js:18)
   └─ gửi mã 6 số qua email (utils/email.js)

POST /api/users/auth/register/verify    → verifyOtpAndRegister() auth.service.js:180
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

**Khoá tài khoản sau nhiều lần sai**: đếm ở `login` (`auth.service.js:42`).

---

### 3.2 Phương tiện & mã QR

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

### 3.3 Gói dài hạn

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
(`utils/refundPolicy.js:19`), mặc định 80% nếu tòa chưa cấu hình `ReservationPolicy`.
`isActive: false` → hoàn 0%.

**Hạn mức giờ/ngày**: `defaultMaxHoursByDuration` (`utils/longTermUsage.js:14`) —
tuần 5h, tháng 7h, năm 10h. `maxHoursPerDay = 0` nghĩa là **không giới hạn**.

**Tự hết hạn**: `src/jobs/subscriptionExpiry.job.js` chạy nền, gọi
`expireStaleSubscriptions` (`slotLifecycle.service.js:47`). Có khoá chống chạy trùng ở
`src/utils/jobLock.js` — nhiều instance server không được cùng expire một gói.

---

### 3.4 Check-in (nghiệp vụ phức tạp nhất)

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

### 3.5 Check-out & tính phí

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

### 3.6 Nhận diện biển số bằng camera

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

### 3.7 Thanh toán

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

### 3.8 Sự cố & phạt

`src/services/shared/incidentResolve.service.js:148` — `applyIncidentAction`.

Loại vi phạm do **manager tự định nghĩa** cho tòa của mình:
`src/models/policy/ViolationType.js` + `src/services/manager/violationType.service.js`.
Đây là lựa chọn thiết kế: mỗi tòa nhà có nội quy riêng, hard-code danh sách vi phạm vào
code là sai mô hình kinh doanh.

Tiền phạt được duyệt sẽ **treo** trên phiên (`status: 'penalty_pending'` —
`checkOut.service.js:37`) và thu tại cổng lúc xe ra.

---

### 3.9 Ca làm việc

`Shift` (mẫu ca) và `StaffShift` (phân công cụ thể) là **hai model tách biệt** —
`src/models/operations/`.

`assertStaffHasActiveShift` (`entryAuthorization.service.js:35`) chặn nhân viên
check-in/check-out ngoài ca. Trả lời cho câu hỏi kiểm toán "ai cho xe này vào lúc 2 giờ
sáng?" — không có ca thì không thao tác được.

---

### 3.10 Kiosk tự phục vụ

`src/services/kiosk.service.js:54` — `selfCheckInByQr`. Khách có gói dài hạn quét QR xe
là tự vào, không cần nhân viên.

Bảo mật: `src/middlewares/kioskDevice.middleware.js` yêu cầu `KIOSK_DEVICE_TOKEN` — token
nạp sẵn trên từng máy kiosk, **cố ý không phải giá trị trình duyệt đọc được**. Máy kiosk
không có token thì không tạo được phiên gửi xe.

Kiosk và nhân viên dùng **chung** `resolveScannedQr` → luật hết hạn QR không thể lệch
nhau giữa hai đường quét.

---

## Phần 4 — Hướng dẫn code: thêm một chức năng mới

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

Chạy: `npm test` (685 test, ~5 phút) hoặc `npx jest <đường-dẫn>` cho một file.
Test dùng `mongodb-memory-server` — không đụng vào database thật.

### Bước 7 — Cập nhật tài liệu này

Thêm dòng vào bảng tra cứu Phần 2. Tài liệu sai còn nguy hiểm hơn không có tài liệu.

---

## Phần 5 — Câu hỏi giảng viên hay hỏi

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
| Có bao nhiêu test? | 685 test / 72 bộ, có test chặn Swagger lệch | `npm test` |

---

## Phần 6 — Lệnh hay dùng

```bash
npm run dev                    # chạy dev (nodemon)
npm run dev:memory             # chạy với MongoDB in-memory, không cần Atlas
npm test                       # 685 test
npx jest tests/unit/swaggerDocumentation.test.js   # chỉ kiểm tra Swagger
npm run audit:business-logic   # rà soát bất biến nghiệp vụ (dry-run)
npm run migrate:vehicles:dry   # xem trước migration Vehicle
npm run migrate:vehicles       # chạy migration (BẮT BUỘC 1 lần mỗi database)
```

Swagger UI: chạy server rồi mở `/api-docs`.
