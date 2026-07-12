# PBMS Backend — System Design

Parking Building Management System (PBMS) — REST API cho 4 vai trò:
**user** (khách gửi xe), **staff** (nhân viên cổng), **manager** (quản lý tòa nhà),
**admin** (quản trị nền tảng, đồng thời là operator với quyền xem read-only building).

Stack: **Node.js + Express 4**, **MongoDB + Mongoose 8** (transactions),
**JWT** (auth), **PayOS** (cổng thanh toán), **nodemailer** (email),
**Jest + mongodb-memory-server + supertest** (test).

---

## 1. Kiến trúc phân lớp

```
routes/  (khai báo endpoint + swagger)          admin/ manager/ staff/ user/ payment/
   │  gắn middleware: auth → rbac → validator → rateLimiter
   ▼
controllers/  (đọc req, gọi service, trả response chuẩn qua utils/response)
   ▼
services/     (TOÀN BỘ business logic — controller không chứa nghiệp vụ)
   │            admin/ manager/ staff/ user/ payment/
   │            staff/parkingSession/ (checkIn, checkOut, query, helpers)
   │            reservationLifecycle.service (dùng chung mọi vai trò)
   ▼
models/       (Mongoose schema theo domain)
   building/  Building · Floor · Zone · ParkingSlot · Gate · VehicleType · BuildingManager
   operations/ ParkingSession · Reservation · Shift · StaffShift · Feedback
   policy/    PricePolicy · ReservationPolicy · LongTermPackage · LongTermSubscription
   finance/   Payment · WalletTransaction · BuildingWallet · BuildingWalletTransaction
   log/       AuditLog · Incident · Notification
   user/      User
jobs/         reservationExpiry (5 phút) · subscriptionExpiry (1 giờ) — có jobLock chống chạy trùng
utils/        feeEngine · reservationHold · plate.util · staffScope/managerScope · email · …
```

**Quy tắc:** logic tiền bạc luôn nằm trong `mongoose.startSession().withTransaction()`;
mọi thao tác nhạy cảm ghi `AuditLog` (qua `staffScope.logAudit`).

## 2. Domain model & bất biến nghiệp vụ

### Slot & Zone
- `Zone.usageType` ∈ `walk_in | registered | subscriber | reserved` — denormalize
  xuống `ParkingSlot.usageType`. Slot không gắn zone (`usageType = null`) là slot
  **vạn năng** (mọi loại xe/đối tượng).
- Chuỗi fallback MỘT CHIỀU (`helpers.acceptableUsageTypes`): hội viên/đặt chỗ được
  dùng slot chung, nhưng **walk-in không bao giờ chiếm slot subscriber/reserved**.
- `findCompatibleSlots` (gợi ý tự động) và `isSlotUsageCompatible` (chọn tay) dùng
  chung ngữ nghĩa — kể cả slot `null` (vạn năng).

### Reservation (đặt chỗ theo giờ)
- Chỉ đặt **giờ nguyên** (`assertWholeHourDuration`), tối đa
  `ReservationPolicy.maxDurationHours`, đặt trước tối đa `maxAdvanceDays`.
- Đặt cọc `depositPercent`% (mặc định 15) của phí ước tính (`feeEngine`), trừ ví
  user + credit ví tòa nhà — tất cả trong 1 transaction, kèm capacity guard
  (không đếm slot dãy subscriber vì reservation không bao giờ được xếp vào đó).
- Hủy: trước `cancellationCutoffHours` (snapshot lúc đặt); hoàn `refundPercent`%
  cọc, phần giữ lại ghi `Payment(type=cancellation_fee)` để báo cáo doanh thu rõ ràng.
- **Hết hạn (no-show): MỘT nguồn duy nhất** — `services/reservationLifecycle.service.js`
  `expireReservationWithRefund()`: flip trạng thái atomic (chỉ 1 caller thắng) →
  thả slot (trừ slot bảo trì) → hoàn `refundPercent`% cọc. Được gọi từ **3 đường**:
  job `reservationExpiry`, check-in bằng biển số (`helpers.resolveReservation`),
  staff expire tay (`staff/reservation.service`). *Không được* tự viết logic expire
  ở nơi khác — trước đây 3 đường lệch nhau khiến user được/mất tiền tùy đường code.
- Check-in sớm nhất `startTime − maxHoldMinutes`; quá `startTime + maxHoldMinutes`
  chưa vào → expired.

### Long-term package (gói dài hạn — floating)
- Gói **không giữ slot cố định**; staff/hệ thống gán slot trống dãy `subscriber`
  lúc check-in. Hết bãi → gói cũng bị chặn theo capacity (không còn bypass).
- 1 biển số = 1 gói `active|pending` (check + unique partial index chống race).
- Miễn phí trong `maxHoursPerDay`/ngày (cộng dồn theo ngày — `longTermUsage`);
  phần vượt tính theo PricePolicy thường, có chặn khai thác qua nửa đêm.
- Hủy trong 3 ngày từ `startDate`, hoàn `refundPercent`% (fallback 80% khi building
  chưa có ReservationPolicy — có test chốt hành vi này); gia hạn cộng dồn từ
  `endDate`, cho phép trễ ≤ 7 ngày.

### Check-in / Check-out (staff)
- Staff phải có **ca hôm nay** (`StaffShift`) tại building; checkout chấp nhận ca
  hôm qua (xe qua đêm). Building có `operatingHours` thì chặn ngoài giờ.
- Ảnh **chân dung bắt buộc mọi check-in** (đối chiếu người lấy xe); khách vãng lai
  thêm ảnh **biển số** (`PLATE_IMAGE_REQUIRED`). Gói/đặt chỗ định danh bằng quét.
- Slot staff chọn phải thuộc đúng building (cả luồng gói lẫn walk-in).
- Checkout reservation: thu `estimatedFee − deposit`; vào sớm/ra trễ tính thêm theo
  giá thường; phần trễ nhân thêm `1 + overstayPenaltyPercent/100` (manager cấu hình).
- Fee fallback khi building chưa có PricePolicy: `DEFAULT_HOURLY_RATE` theo loại xe.

### Tiền & doanh thu
- **`Payment` là nguồn sự thật duy nhất của doanh thu** (model ShiftRevenue đã xóa).
  Mọi dòng tiền: `WalletTransaction` (ví user, audit) + `Payment` + credit/debit
  `BuildingWallet` (`BuildingWalletTransaction`). Refund dùng `allowNegative` để ví
  tòa nhà có thể âm khi hoàn tiền.
- PayOS: webhook (`payment/webhook.controller`) verify chữ ký → settle theo
  `payosOrderCode` (idempotent, race-safe, dùng chung code với endpoint verify tay).

## 3. Jobs định kỳ
| Job | Chu kỳ | Việc |
|---|---|---|
| `reservationExpiry` | 5 phút | expire no-show (qua lifecycle service) + notify; cảnh báo overstay 1 lần |
| `subscriptionExpiry` | 1 giờ | nhắc hạn 7/5/3/1 ngày (`remindersSent`); active→expired + notify |

Cả hai dùng `jobLock` (khóa TTL trong Mongo) chống chạy trùng đa instance; email
best-effort (lỗi SMTP không rollback nghiệp vụ).

## 4. AuthN / AuthZ
- JWT Bearer (`auth.middleware`), RBAC theo role (`rbac.middleware`).
- Scope dữ liệu: staff bị giới hạn `assignedBuildings` (`staffScope.assertBuildingScope`),
  manager theo `managerScope`. Lockout đăng nhập sai nhiều lần + phone unique ở BE.
- OTP đăng ký + reset password qua email (`utils/email`, templates dùng chung layout).

> ⚠️ Lưu ý môi trường dev Windows: Windows Defender từng false-positive
> (`Trojan:Script/ObfusScript.A!ml`) và **xóa `src/utils/email.js`** làm server
> không khởi động. File đã được viết lại theo cấu trúc khác để không còn bị flag;
> nếu tái diễn, thêm exclusion cho thư mục dự án.

## 5. Test (`tests/`)
- `unit/` + gốc (`fee`, `plate`, `usage`, `flows`, `subscribe`, `jobs`, `reservation`,
  `payos`) — service-level với mongodb-memory-server.
- `integration/` theo vai trò (admin/manager/staff/user) — gọi service như controller.
- `system/lifecycle.e2e.test.js` — supertest qua HTTP đầy đủ vòng đời.
- Chạy: `npm test` (jest `--runInBand`). Test là **spec hành vi tiền bạc** — sửa
  logic refund/fee phải cập nhật test tương ứng trong cùng PR.

## 6. Nợ kỹ thuật / hướng cải thiện
1. `docs/swagger.paths.js` + các file `*.swagger.js` (~2.3k dòng) — cân nhắc sinh
   từ JSDoc hoặc tách theo module để đỡ trôi so với route thật.
2. `webhook.service.handleReservationFee` — nhánh PayOS cho reservation gần như
   dead code (đặt chỗ hiện chỉ trừ ví); giữ để tương thích, cần test nếu bật lại.
3. Chuẩn hóa fallback `refundPercent` (reservation: 0, long-term: 80) — hành vi
   đã chốt bằng test nhưng nên đưa cả hai về `ReservationPolicy` bắt buộc khi seed
   building mới.
