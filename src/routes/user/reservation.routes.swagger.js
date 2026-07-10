/**
 * @swagger
 * /api/user/reservations/policy:
 *   get:
 *     tags: [User - Reservations]
 *     summary: Giới hạn đặt chỗ công khai của building (maxAdvanceDays, maxDurationHours...) — dùng để ràng buộc date/duration picker trước khi chọn giờ cụ thể
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chính sách đặt chỗ của building
 *
 * /api/user/reservations/estimate:
 *   get:
 *     tags: [User - Reservations]
 *     summary: Ước tính phí đặt chỗ
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema: { type: string }
 *       - in: query
 *         name: vehicleTypeId
 *         schema: { type: string }
 *       - in: query
 *         name: startTime
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endTime
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Ước tính thành công
 *
 * /api/user/reservations:
 *   get:
 *     tags: [User - Reservations]
 *     summary: Danh sách reservation của user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách reservation
 *   post:
 *     tags: [User - Reservations]
 *     summary: Tạo reservation mới
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [buildingId, vehicleTypeId, licensePlateId, startTime, endTime]
 *             properties:
 *               buildingId: { type: string }
 *               vehicleTypeId: { type: string }
 *               licensePlateId: { type: string }
 *               startTime: { type: string, format: date-time }
 *               endTime: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Tạo reservation thành công
 *
 * /api/user/reservations/{id}:
 *   get:
 *     tags: [User - Reservations]
 *     summary: Xem chi tiết reservation
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết reservation
 *   delete:
 *     tags: [User - Reservations]
 *     summary: Hủy reservation
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Hủy thành công
 */
