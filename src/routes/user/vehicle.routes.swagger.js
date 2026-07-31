/**
 * @swagger
 * components:
 *   schemas:
 *     Vehicle:
 *       type: object
 *       description: >
 *         Một phương tiện đã đăng ký của người dùng. Biển số là DUY NHẤT trên toàn hệ
 *         thống (unique index theo "lõi" biển số, bỏ qua dấu cách/dấu chấm), nên một
 *         biển chỉ thuộc đúng một tài khoản.
 *       properties:
 *         _id: { type: string, example: 66b1f2c4a8e91d0012ab34cd }
 *         owner: { type: string, example: 66b1f2c4a8e91d0012ab0001 }
 *         plateNumber: { type: string, example: 59G2-038.80 }
 *         category:
 *           type: string
 *           enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
 *           example: car
 *           description: Thể loại xe chuẩn của hệ thống (GET /api/users/vehicle-categories).
 *         brand: { type: string, nullable: true, example: Toyota }
 *         isDefault: { type: boolean, example: true }
 *         qrCode:
 *           type: string
 *           example: PLT-7a9f2c11b8d4e003
 *           description: Token QR gắn theo xe; staff/kiosk quét để nhận diện xe.
 *         qrIssuedAt: { type: string, format: date-time }
 *         qrExpiresAt:
 *           type: string
 *           format: date-time
 *           description: >
 *             Mốc hết hạn của token QR (mặc định 2 ngày kể từ lúc cấp, cấu hình bằng
 *             biến môi trường VEHICLE_QR_TTL_DAYS). Khi chủ xe gọi GET /api/users/vehicles
 *             mà mã đã quá hạn, hệ thống tự cấp token mới và trả về mã còn hạn — client
 *             không cần xử lý gì thêm. Mã quá hạn bị từ chối ở cổng với lỗi
 *             VEHICLE_QR_EXPIRED (410).
 *
 * /api/users/vehicle-categories:
 *   get:
 *     summary: Danh mục thể loại xe của hệ thống
 *     description: >
 *       Nguồn duy nhất để frontend dựng dropdown chọn loại xe — không chép cứng danh
 *       sách ở client. Kèm `qrTtlDays` để UI hiển thị đúng hạn dùng của mã QR.
 *     tags: [User - Vehicles]
 *     responses:
 *       200:
 *         description: Danh sách thể loại xe
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           code: { type: string, example: motorcycle }
 *                           label: { type: string, example: Xe máy }
 *                     qrTtlDays: { type: integer, example: 2 }
 *
 * /api/users/vehicles:
 *   get:
 *     summary: Danh sách phương tiện của tôi
 *     description: >
 *       Trả về tối đa 5 xe, xe mặc định đứng đầu. Mã QR quá hạn được cấp lại ngay
 *       trong lần gọi này nên giá trị `qrCode` trả về luôn dùng được.
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Danh sách phương tiện
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Vehicle' }
 *       401: { description: Chưa đăng nhập }
 *   post:
 *     summary: Đăng ký phương tiện mới
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plateNumber]
 *             properties:
 *               plateNumber: { type: string, example: 59G2-038.80 }
 *               category:
 *                 type: string
 *                 enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
 *                 default: car
 *               brand: { type: string, nullable: true, example: Toyota }
 *     responses:
 *       201:
 *         description: Đã thêm phương tiện
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicle: { $ref: '#/components/schemas/Vehicle' }
 *       400: { description: "Biển số sai định dạng (INVALID_PLATE_FORMAT) hoặc đã đủ 5 xe (VEHICLE_LIMIT_REACHED)" }
 *       409: { description: "Trùng biển của chính mình (VEHICLE_ALREADY_EXISTS) hoặc biển đã thuộc tài khoản khác (PLATE_OWNED_BY_ANOTHER_USER)" }
 *
 * /api/users/vehicles/{vehicleId}:
 *   get:
 *     summary: Chi tiết một phương tiện
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thông tin phương tiện (mã QR đã được làm mới nếu quá hạn)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicle: { $ref: '#/components/schemas/Vehicle' }
 *       404: { description: "Không tìm thấy phương tiện (VEHICLE_NOT_FOUND)" }
 *   put:
 *     summary: Cập nhật thông tin phương tiện
 *     description: >
 *       Biển số KHÔNG sửa được (xoá xe rồi thêm lại nếu nhập sai). Đổi `category` bị
 *       chặn khi xe đang gửi trong bãi hoặc đang gắn gói dài hạn còn hiệu lực, vì loại
 *       xe quyết định bảng giá và ô đỗ tương thích.
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Cần ít nhất một trường.
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
 *               brand: { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Đã cập nhật
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicle: { $ref: '#/components/schemas/Vehicle' }
 *       409: { description: "Đang gửi xe hoặc đang có gói (VEHICLE_CATEGORY_CONFLICT)" }
 *   delete:
 *     summary: Xoá phương tiện
 *     description: >
 *       Bị chặn khi xe đang gửi trong bãi hoặc còn gói dài hạn hiệu lực. Xoá xe mặc
 *       định thì xe cũ nhất còn lại tự lên làm mặc định.
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách phương tiện còn lại
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Vehicle' }
 *       409: { description: "VEHICLE_HAS_ACTIVE_SESSION | VEHICLE_HAS_ACTIVE_SUBSCRIPTION" }
 *
 * /api/users/vehicles/{vehicleId}/default:
 *   patch:
 *     summary: Đặt xe mặc định
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách phương tiện sau khi đổi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicles:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Vehicle' }
 *
 * /api/users/vehicles/{vehicleId}/qr/refresh:
 *   post:
 *     summary: Cấp lại mã QR cho phương tiện
 *     description: >
 *       Huỷ token cũ NGAY LẬP TỨC kể cả khi chưa hết hạn, và cấp token mới có hạn
 *       VEHICLE_QR_TTL_DAYS ngày. Dùng khi chủ xe nghi mã bị chụp trộm.
 *     tags: [User - Vehicles]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: vehicleId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mã QR mới
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vehicle: { $ref: '#/components/schemas/Vehicle' }
 *       404: { description: "Không tìm thấy phương tiện (VEHICLE_NOT_FOUND)" }
 */
