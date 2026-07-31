# Parking Building Management System — Backend

API backend cho **PBMS** (quản lý bãi xe đa tòa nhà, đa tầng).  
Stack: **Node.js**, **Express**, **MongoDB Atlas**, **Mongoose**, **JWT**.

Tài liệu tham chiếu: `Requirements+Database.docx`, ERD (25 collections).

---

## Mục lục

1. [Quy trình Git (bắt buộc)](#1-quy-trình-git-bắt-buộc)
2. [Cài đặt & chạy project](#2-cài-đặt--chạy-project)
3. [Kết nối database](#3-kết-nối-database)
4. [Cấu trúc thư mục (chi tiết)](#4-cấu-trúc-thư-mục-chi-tiết)
5. [Mô hình dữ liệu (collections)](#5-mô-hình-dữ-liệu-collections)
6. [Danh sách API](#6-danh-sách-api)
7. [API đã triển khai](#7-api-đã-triển-khai)
8. [Xử lý lỗi thường gặp](#8-xử-lý-lỗi-thường-gặp)


---

## 1. Quy trình Git (bắt buộc)

**Không commit trực tiếp lên `main`.** Mỗi tính năng = một nhánh → Pull Request → review → merge.

| Bước | Lệnh / việc cần làm |
|------|---------------------|
| 1 | `git checkout main` → `git pull origin main` |
| 2 | `git checkout -b feature/ten-tinh-nang` |
| 3 | Code, test, `git commit -m "feat(module): mô tả"` |
| 4 | `git push -u origin feature/ten-tinh-nang` |
| 5 | Tạo **Pull Request** → base: `main` — mô tả API thay đổi + cách test |
| 6 | Chờ approve → merge → xóa nhánh local |

Ví dụ tên nhánh: `feature/user-wallet`, `feature/staff-check-in`, `fix/auth-validation`.

---

## 2. Cài đặt & chạy project

### Yêu cầu

- Node.js 18+
- File `.env` (xem [mục 3](#3-kết-nối-database))

### Các bước

```bash
cd ParkingManagement_BE
npm install
copy .env.example .env
npm run dev
```

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Chạy server (nodemon), **tự chọn port trống** nếu 5000 bận |
| `npm start` | Chạy production |

Khi thành công, terminal in:

```text
[Server] Server đã chạy thành công — http://localhost:5000
```

Mở trình duyệt `http://localhost:XXXX/` → JSON xác nhận API đang chạy.  
**Dùng đúng port** in trong log (có thể 5001, 5002…).

---

## 3. Kết nối database

Cluster team: **`parking-system`**, database: **`parking-building-management-system`**.

### File `.env`

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb+srv://locpxse184345_db_user:<PASSWORD>@parking-system.z4ngm7b.mongodb.net/parking-building-management-system?retryWrites=true&w=majority

JWT_SECRET=your_secret_min_32_chars
JWT_EXPIRES_IN=7d
```

| Biến | Ý nghĩa |
|------|---------|
| `MONGODB_URI` | Chuỗi kết nối Atlas (có tên DB trong path) |
| `JWT_SECRET` | Khóa ký JWT |
| `PORT` | Port ưu tiên (server tự tăng nếu bận) |

> `.env` không commit lên Git.

### MongoDB Compass

1. New Connection → dán `MONGODB_URI`
2. Connect → chọn DB `parking-building-management-system`
3. Collections xuất hiện khi API ghi dữ liệu lần đầu

---

## 4. Cấu trúc thư mục (chi tiết)

Kiến trúc **phân lớp** — mỗi request đi theo chuỗi:

```text
Route → Validator → Controller → Service → Model → MongoDB
```

```
ParkingManagement_BE/
├── .env.example              # Mẫu biến môi trường (commit được)
├── .env                      # Cấu hình thật (KHÔNG commit)
├── package.json
├── nodemon.json              # Chỉ watch thư mục src/
├── README.md
│
└── src/
    ├── server.js             # Entry: connect DB → tìm port → listen
    ├── app.js                # Khởi tạo Express, CORS, JSON, mount /api
    │
    ├── config/
    │   ├── env.js            # Đọc & validate biến môi trường
    │   └── db.js             # mongoose.connect(MONGODB_URI)
    │
    ├── constants/
    │   └── roles.js          # admin | manager | staff | user
    │
    ├── models/               # Mongoose schema ↔ collection MongoDB
    │   ├── User.js           # users
    │   ├── Building.js       # buildings (mở rộng theo ERD)
    │   └── index.js          # Export tập trung các model
    │
    ├── validators/           # Kiểm tra body/query trước controller
    │   └── auth.validator.js # validate register/login
    │
    ├── controllers/          # Nhận req/res, gọi service, format response
    │   └── auth.controller.js
    │
    ├── services/             # Business logic (phí, ví, phân bổ doanh thu…)
    │   └── auth.service.js
    │
    ├── middlewares/
    │   ├── auth.middleware.js  # JWT Bearer → gắn req.user
    │   ├── rbac.js             # Phân quyền theo role
    │   └── errorHandler.js     # 404 + xử lý lỗi tập trung
    │
    ├── routes/               # Định nghĩa endpoint theo module/role
    │   ├── index.js          # Mount /users, /staff, /manager, /admin
    │   ├── user/
    │   │   ├── index.js
    │   │   └── auth.routes.js    # /api/users/auth/*
    │   ├── staff/            # Ca trực, check-in/out
    │   ├── manager/          # Quản lý tòa được giao
    │   └── admin/            # Toàn hệ thống
    │
    └── utils/
        ├── AppError.js       # Lỗi có statusCode (400, 401, 404…)
        ├── asyncHandler.js   # Bắt lỗi async cho controller
        ├── response.js       # sendSuccess() — format JSON thống nhất
        ├── token.js          # signToken / verifyToken (JWT)
        ├── findPort.js       # Tự chọn port trống khi dev
        ├── formatDate.js     # Định dạng ngày giờ
        └── generateBookingCode.js  # Sinh mã tham chiếu ngắn (mã sự cố INC-…)
```

### Quy ước khi thêm tính năng mới

| Thêm | Đặt tại | Ví dụ |
|------|---------|--------|
| Schema DB | `src/models/X.js` | `ParkingSession.js` |
| API route | `src/routes/<role>/` | `staff/session.routes.js` |
| Logic | `src/services/x.service.js` | `parkingSession.service.js` |
| Validate input | `src/validators/` | `session.validator.js` |

---

## 5. Mô hình dữ liệu (collections)

Theo ERD — ánh xạ sang MongoDB (Mongoose):

| Collection | Mô tả ngắn |
|------------|------------|
| `users` | Tài khoản (admin, manager, staff, user), ví `balance` |
| `buildings` | Tòa nhà / bãi xe |
| `floors` | Tầng trong building |
| `parking_slots` | Ô xe (`code`, `status`) |
| `vehicle_types` | Loại xe (ô tô, xe máy…) |
| `gates` / `gate_points` / `gate_vehicle_types` | Cổng ra vào |
| `parking_sessions` | Phiên gửi xe (vào/ra, phí, thanh toán) |
| `long_term_packages` | Gói vé tháng/quý |
| `long_term_subscriptions` | User mua gói dài hạn |
| `members` | Thành viên đang hiệu lực |
| `payments` | Thanh toán chung |
| `wallet_transactions` | Lịch sử biến động ví |
| `system_wallet` | Ví hệ thống |
| `revenue_distributions` | Phân bổ doanh thu |
| `shifts` / `staff_shifts` / `shift_revenues` | Ca trực & doanh thu ca |
| `building_managers` | Gán manager ↔ building |
| `reservation_policies` | Chính sách hoàn tiền khi hủy gói dài hạn (collection giữ tên cũ) |
| `notifications` | Thông báo |
| `feedbacks` | Đánh giá building |
| `audit_logs` | Nhật ký thao tác admin |

---

## 6. Danh sách API

Base URL: `http://localhost:<PORT>/api`  
Header chung (khi cần đăng nhập): `Authorization: Bearer <token>`

### 6.1 User (`/api/users`) — Khách hàng / role `user`

| Method | Endpoint | Mô tả | Trạng thái |
|--------|----------|--------|------------|
| POST | `/auth/register` | Đăng ký tài khoản 
| POST | `/auth/login` | Đăng nhập, nhận JWT 
| GET | `/auth/me` | Thông tin user hiện tại 
| PATCH | `/profile` | Cập nhật họ tên, phone, avatar 
| GET | `/wallet` | Số dư ví 
| GET | `/wallet/transactions` | Lịch sử giao dịch ví 
| POST | `/wallet/top-up` | Nạp tiền ví 
| GET | `/buildings` | Danh sách bãi đang hoạt động
| GET | `/buildings/:id` | Chi tiết bãi 
| GET | `/buildings/:id/floors` | Tầng + loại xe 
| GET | `/buildings/:id/slots` | Tra cứu ô trống 
| GET | `/buildings/:id/feedbacks` | Đánh giá bãi 
| POST | `/buildings/:id/feedbacks` | Gửi đánh giá 
| GET | `/parking-sessions` | Lịch sử gửi xe 
| GET | `/parking-sessions/:id` | Chi tiết phiên + phí 
| GET | `/packages` | Gói vé dài hạn (lọc building) 
| POST | `/subscriptions` | Mua gói dài hạn 
| GET | `/subscriptions` | Gói đã mua
| GET | `/memberships` | Tư cách thành viên hiện tại 
| GET | `/payments` | Lịch sử thanh toán 
| POST | `/payments` | Thanh toán phiên / gói 
| GET | `/notifications` | Thông báo 
| PATCH | `/notifications/:id/read` | Đánh dấu đã đọc

### 6.2 Staff (`/api/staff`) — Nhân viên bãi

| Method | Endpoint | Mô tả | Trạng thái |
|--------|----------|--------|------------|
| GET | `/shifts/today` | Ca trực hôm nay 
| GET | `/buildings/:buildingId/slots` | Trạng thái ô xe 
| PATCH | `/slots/:id/status` | Cập nhật trạng thái ô 
| POST | `/parking-sessions/check-in` | Ghi nhận xe vào 
| PATCH | `/parking-sessions/:id/check-out` | Ghi nhận xe ra + tính phí 
| GET | `/parking-sessions/active` | Phiên đang trong bãi 
| POST | `/shift-revenues` | Chốt doanh thu ca 

### 6.3 Manager (`/api/manager`) — Quản lý tòa

| Method | Endpoint | Mô tả | Trạng thái |
|--------|----------|--------|------------|
| GET | `/buildings` | Các tòa được gán (`building_managers`) 
| PATCH | `/buildings/:id` | Sửa giờ mở cửa, trạng thái 
| CRUD | `/buildings/:id/floors` | Quản lý tầng 
| CRUD | `/floors/:floorId/slots` | Quản lý ô xe 
| CRUD | `/buildings/:id/gates` | Cổng ra vào 
| CRUD | `/buildings/:id/shifts` | Định nghĩa ca trực 
| GET/POST | `/staff-shifts` | Phân ca nhân viên 
| CRUD | `/packages` | Gói vé dài hạn 
| GET/PUT | `/buildings/:buildingId/refund-policy` | % hoàn tiền khi hủy gói dài hạn
| GET | `/buildings/:buildingId/wallet/revenue-breakdown` | Doanh thu gộp, hoàn tiền, thuần và tiền mặt chờ xác nhận
| GET | `/subscriptions` | Gói đã bán trong tòa 
| GET | `/feedbacks` | Phản hồi khách 

### 6.4 Admin (`/api/admin`) — Chủ hệ thống PBMS

| Method | Endpoint | Mô tả | Trạng thái |
|--------|----------|--------|------------|
| CRUD | `/users` | Quản lý mọi role 
| PATCH | `/users/:id/status` | Khóa / mở tài khoản 
| CRUD | `/buildings` | Toàn bộ tòa nhà 
| POST | `/buildings/:id/assign-manager` | Gán Manager vận hành bãi
| POST | `/buildings/:id/assign-staff` | Gán Staff cho bãi
| GET | `/revenue` | Báo cáo gross/refund/net/pending cash theo bãi
| GET | `/revenue/transactions` | Sổ Payment toàn hệ thống
| GET | `/revenue/reconciliation` | Đối soát tiền chờ và sai lệch ví–sổ cái
| GET | `/governance/roles` | Ma trận trách nhiệm Admin/Manager/Staff/User
| GET | `/audit-logs` | Nhật ký (`audit_logs`) 




---


## 7. Xử lý lỗi thường gặp

### Port 5000 đang bận

Server tự dùng 5001, 5002… — đọc log `Server đã chạy thành công — http://localhost:XXXX`.

### Thiếu biến môi trường

```text
Missing env: mongodbUri, jwtSecret
```

→ Tạo `.env` từ `.env.example`.

### Không kết nối Atlas

- Whitelist IP trên Atlas
- Kiểm tra `MONGODB_URI`
- Kiểm tra mạng / VPN

---

