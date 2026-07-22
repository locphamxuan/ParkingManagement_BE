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
   │            admin/ manager/ staff/ user/ payment/ shared/ (incidentResolve, dùng chung staff+manager)
   │            staff/parkingSession/ (checkIn, checkOut, query, helpers)
   ▼
models/       (Mongoose schema theo domain)
   building/  Building · Floor · Zone · ParkingSlot · Gate · VehicleType · BuildingManager
   operations/ ParkingSession · Shift · StaffShift · Feedback
   policy/    PricePolicy · ReservationPolicy (chỉ còn refundPercent/ruleViolationFee) · LongTermPackage · LongTermSubscription
   finance/   Payment · WalletTransaction · BuildingWallet · BuildingWalletTransaction
   log/       AuditLog · Incident · Notification
   user/      User
jobs/         subscriptionExpiry (1 giờ) — có jobLock chống chạy trùng
utils/        feeEngine · refundPolicy · plate.util · staffScope/managerScope · email · …
```

**Quy tắc:** logic tiền bạc luôn nằm trong `mongoose.startSession().withTransaction()`;
mọi thao tác nhạy cảm ghi `AuditLog` (qua `staffScope.logAudit`).

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
còn** nhưng chỉ giữ `refundPercent`/`ruleViolationFee` — không còn field đặt chỗ.
Đợt audit 2026-07-22 (Phase 2) phát hiện tài liệu + FE/Mobile vẫn còn gọi/mô tả
tính năng này như đang sống dù đã xoá 6 ngày trước đó — đã dọn sạch FE (xoá
`ReservationsPage`/`StaffReservationsPage`/`userApi.reservations.*`) và Mobile
(xoá chế độ `bookingType:'hourly'` khỏi `useReservations`, giữ lại mua gói).

### Long-term package (gói dài hạn)
- **Mặc định floating** (không giữ slot cố định); staff/hệ thống gán slot trống
  dãy `subscriber` lúc check-in. Hết bãi → gói cũng bị chặn theo capacity (không
  còn bypass).
- **Tuỳ chọn giữ slot cố định lúc đăng ký** (`subscribe(..., slotId)`,
  `services/user/longTerm.service.js`): nếu client gửi kèm `slotId` hợp lệ (cùng
  building, `usageType:'subscriber'`, còn `available`, đúng vehicleType) → claim
  slot đó ngay (chuyển `reserved`), lưu vào `Subscription.slot`; check-in sau đó
  tự nhận đúng slot đã giữ. Đây là cơ chế thay thế cho reservation theo giờ đã bỏ.
- 1 biển số = 1 gói `active|pending` (check + unique partial index chống race).
- Miễn phí trong `maxHoursPerDay`/ngày (cộng dồn theo ngày — `longTermUsage`);
  phần vượt tính theo PricePolicy thường, có chặn khai thác qua nửa đêm.
- Hủy trong 3 ngày từ `startDate`, hoàn `refundPercent`% (fallback 80% khi building
  chưa có ReservationPolicy — có test chốt hành vi này, xem `utils/refundPolicy.js`);
  gia hạn cộng dồn từ `endDate`, cho phép trễ ≤ 7 ngày. Hủy nhả slot cố định
  (nếu có) về `available`.


### Check-in / Check-out (staff)
- Staff phải có **ca hôm nay** (`StaffShift`) tại building; checkout chấp nhận ca
  hôm qua (xe qua đêm). Building có `operatingHours` thì chặn ngoài giờ.
- Ảnh **chân dung bắt buộc mọi check-in** (đối chiếu người lấy xe); khách vãng lai
  thêm ảnh **biển số** (`PLATE_IMAGE_REQUIRED`). Gói định danh bằng quét.
- Slot staff chọn phải thuộc đúng building (cả luồng gói lẫn walk-in).
- Checkout: gói dài hạn miễn phí trong `maxHoursPerDay`, phần vượt tính giá thường;
  vào sớm/ra trễ tính thêm theo giá thường; phần trễ nhân thêm
  `1 + overstayPenaltyPercent/100` (manager cấu hình).
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
| `subscriptionExpiry` | 1 giờ | nhắc hạn 7/5/3/1 ngày (`remindersSent`); active→expired + notify |

Dùng `jobLock` (khóa TTL trong Mongo) chống chạy trùng đa instance; email
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
- `unit/` + gốc (`fee`, `plate`, `usage`, `flows`, `subscribe`, `jobs`,
  `payos`) — service-level với mongodb-memory-server.
- `integration/` theo vai trò (admin/manager/staff/user) — gọi service như controller.
- `system/lifecycle.e2e.test.js` — supertest qua HTTP đầy đủ vòng đời.
- Chạy: `npm test` (jest `--runInBand`). Test là **spec hành vi tiền bạc** — sửa
  logic refund/fee phải cập nhật test tương ứng trong cùng PR.


## 6. Nợ kỹ thuật / hướng cải thiện
1. `docs/swagger.paths.js` + các file `*.swagger.js` (~2.3k dòng) — cân nhắc sinh
   từ JSDoc hoặc tách theo module để đỡ trôi so với route thật.
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


