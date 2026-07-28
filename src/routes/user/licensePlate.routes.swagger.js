/**
 * @swagger
 * /api/users/license-plates:
 *   get:
 *     tags: [User - License Plates]
 *     summary: Lấy danh sách biển số của user
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách biển số
 *   post:
 *     tags: [User - License Plates]
 *     summary: Thêm biển số mới
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [plateNumber]
 *             properties:
 *               plateNumber:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Thêm thành công
 *
 * /api/users/license-plates/{plateId}:
 *   put:
 *     tags: [User - License Plates]
 *     summary: Cập nhật biển số
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: plateId
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ObjectId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plateNumber:
 *                 type: string
 *               vehicleType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     tags: [User - License Plates]
 *     summary: Xóa biển số
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: plateId
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ObjectId'
 *     responses:
 *       200:
 *         description: Xóa thành công
 *
 * /api/users/license-plates/{plateId}/default:
 *   patch:
 *     tags: [User - License Plates]
 *     summary: Đặt biển số mặc định
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: plateId
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ObjectId'
 *     responses:
 *       200:
 *         description: Đặt mặc định thành công
 */
