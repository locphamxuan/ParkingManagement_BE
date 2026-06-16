/**
 * @swagger
 * /api/manager/buildings:
 *   get:
 *     tags: [Manager - Building]
 *     summary: Get buildings assigned to the authenticated manager
 *     description: Returns all assigned buildings, or one assigned building when buildingId is provided.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buildingId
 *         schema: { type: string, format: objectId }
 *         description: Optional assigned building id.
 *     responses:
 *       200:
 *         description: Managed building data returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       oneOf:
 *                         - $ref: '#/components/schemas/Building'
 *                         - type: array
 *                           items: { $ref: '#/components/schemas/Building' }
 *       401: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       403: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{id}:
 *   put:
 *     tags: [Manager - Building]
 *     summary: Update an assigned building
 *     description: Updates manager-editable building fields for an active assigned building.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: Central Tower Parking }
 *               totalFloors: { type: integer, minimum: 1, example: 6 }
 *               status: { type: string, enum: [active, inactive, maintenance], example: active }
 *     responses:
 *       200:
 *         description: Building updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Building updated successfully }
 *                     data:
 *                       type: object
 *                       properties:
 *                         building: { $ref: '#/components/schemas/Building' }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       403: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/operating-hours:
 *   put:
 *     tags: [Manager - Building]
 *     summary: Update building operating hours
 *     description: Updates the opening and closing time for an assigned building.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [open, close]
 *             properties:
 *               open: { type: string, example: '06:00' }
 *               close: { type: string, example: '22:00' }
 *     responses:
 *       200:
 *         description: Operating hours updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Operating hours updated successfully }
 *                     data:
 *                       type: object
 *                       properties:
 *                         building: { $ref: '#/components/schemas/Building' }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       403: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/dashboard:
 *   get:
 *     tags: [Manager - Dashboard]
 *     summary: Get manager dashboard overview
 *     description: Returns operational metrics for one assigned building.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Dashboard data returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         activeSessions: { type: integer, example: 18 }
 *                         todayRevenue: { type: number, example: 1250000 }
 *                         availableSlots: { type: integer, example: 64 }
 *                         occupiedSlots: { type: integer, example: 31 }
 *                         reservedSlots: { type: integer, example: 12 }
 *       401: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       403: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/wallet:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: Get building wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Building wallet returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         wallet:
 *                           type: object
 *                           properties:
 *                             _id: { $ref: '#/components/schemas/ObjectId' }
 *                             building: { $ref: '#/components/schemas/ObjectId' }
 *                             balance: { type: number, example: 2500000 }
 *                             totalReceived: { type: number, example: 15000000 }
 *                             totalTransferred: { type: number, example: 5000000 }
 *                             createdAt: { type: string, format: date-time }
 *                             updatedAt: { type: string, format: date-time }
 * /api/manager/buildings/{buildingId}/wallet/transactions:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: List building wallet transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [credit, debit] }
 *       - in: query
 *         name: reason
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Building wallet transactions returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id: { $ref: '#/components/schemas/ObjectId' }
 *                               building: { $ref: '#/components/schemas/ObjectId' }
 *                               type: { type: string, enum: [credit, debit], example: credit }
 *                               amount: { type: number, example: 45000 }
 *                               balanceAfter: { type: number, example: 2545000 }
 *                               reason: { type: string, example: parking_fee }
 *                               relatedPayment: { $ref: '#/components/schemas/ObjectId' }
 *                               performedBy: { $ref: '#/components/schemas/ObjectId' }
 *                               note: { type: string, nullable: true, example: Session payment }
 *                               createdAt: { type: string, format: date-time }
 *                               updatedAt: { type: string, format: date-time }
 *                         pagination: { $ref: '#/components/schemas/PaginationMeta' }
 * /api/manager/buildings/{buildingId}/wallet/daily-revenue:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: Get building daily revenue
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Daily revenue returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         date: { type: string, example: '2026-06-12' }
 *                         totalRevenue: { type: number, example: 1250000 }
 *                         cashAmount: { type: number, example: 300000 }
 *                         walletAmount: { type: number, example: 700000 }
 *                         qrAmount: { type: number, example: 250000 }
 * /api/manager/buildings/{buildingId}/wallet/topup:
 *   post:
 *     tags: [Manager - Wallet]
 *     summary: Initiate PayOS top-up for building wallet
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, minimum: 2000, example: 500000 }
 *     responses:
 *       200:
 *         description: Payment link created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         checkoutUrl: { type: string, example: https://pay.payos.vn/web/example }
 *                         qrCode: { type: string, example: data:image/png;base64,iVBORw0KGgo }
 *                         orderCode: { type: number, example: 123456789 }
 *                         amount: { type: number, example: 500000 }
 * /api/manager/buildings/{buildingId}/wallet/topup/{orderCode}/verify:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: Verify PayOS building wallet top-up status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: orderCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Top-up verification returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         status: { type: string, example: success }
 *                         credited: { type: boolean, example: true }
 *                         balance: { type: number, example: 3000000 }
 *                         amount: { type: number, example: 500000 }
 */
/**
 * @swagger
 * /api/manager/buildings/{buildingId}/vehicle-types:
 *   get:
 *     tags: [Manager - Vehicle Types]
 *     summary: List vehicle types for a building
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Vehicle types returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/VehicleType' }
 *   post:
 *     tags: [Manager - Vehicle Types]
 *     summary: Create a vehicle type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               code: { type: string, example: CAR }
 *               name: { type: string, example: Car }
 *               description: { type: string, example: Standard passenger car }
 *               isActive: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Vehicle type created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Vehicle type created }
 *                     data:
 *                       type: object
 *                       properties:
 *                         item: { $ref: '#/components/schemas/VehicleType' }
 * /api/manager/buildings/{buildingId}/vehicle-types/{id}:
 *   put:
 *     tags: [Manager - Vehicle Types]
 *     summary: Update a vehicle type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code: { type: string, example: CAR }
 *               name: { type: string, example: Car }
 *               description: { type: string, example: Updated description }
 *               isActive: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Vehicle type updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Vehicle type updated }
 *                     data:
 *                       type: object
 *                       properties:
 *                         item: { $ref: '#/components/schemas/VehicleType' }
 *   delete:
 *     tags: [Manager - Vehicle Types]
 *     summary: Remove a vehicle type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Vehicle type removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Vehicle type removed }
 *                     data: { nullable: true, example: null }
 * /api/manager/buildings/{buildingId}/floors:
 *   get:
 *     tags: [Manager - Floors]
 *     summary: List floors in a building
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Floors returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Floor' }
 *   post:
 *     tags: [Manager - Floors]
 *     summary: Create a floor
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, capacity]
 *             properties:
 *               code: { type: string, example: F1 }
 *               capacity: { type: integer, minimum: 1, example: 120 }
 *               allowedVehicleTypes: { type: array, items: { type: string, format: objectId } }
 *               status: { type: string, enum: [active, inactive, maintenance], example: active }
 *     responses:
 *       201:
 *         description: Floor created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Floor created }
 *                     data:
 *                       type: object
 *                       properties:
 *                         item: { $ref: '#/components/schemas/Floor' }
 */
/**
 * @swagger
 * /api/manager/buildings/{buildingId}/floors/{id}:
 *   get:
 *     tags: [Manager - Floors]
 *     summary: Get floor details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Floor returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/Floor' } } } } } ] } } } }
 *   put:
 *     tags: [Manager - Floors]
 *     summary: Update a floor
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { code: { type: string, example: F1 }, capacity: { type: integer, example: 120 }, allowedVehicleTypes: { type: array, items: { type: string, format: objectId } }, status: { type: string, enum: [active, inactive, maintenance], example: active } } } } } }
 *     responses:
 *       200: { description: Floor updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Floor updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Floor' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Floors]
 *     summary: Remove a floor
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Floor removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Floor removed }, data: { nullable: true, example: null } } } ] } } } }
 *       409: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/gates:
 *   get:
 *     tags: [Manager - Gates]
 *     summary: List gates in a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Gates returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Gate' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Gates]
 *     summary: Create a gate
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [code], properties: { code: { type: string, example: GATE-IN-01 }, name: { type: string, example: Main Entrance }, direction: { type: string, enum: [in, out, both], example: in }, allowedVehicleTypes: { type: array, items: { type: string, format: objectId } }, floors: { type: array, items: { type: string, format: objectId } }, status: { type: string, enum: [active, inactive, maintenance], example: active } } } } } }
 *     responses:
 *       201: { description: Gate created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Gate created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Gate' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/gates/{id}:
 *   put:
 *     tags: [Manager - Gates]
 *     summary: Update a gate
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { code: { type: string, example: GATE-IN-01 }, name: { type: string, example: Main Entrance }, direction: { type: string, enum: [in, out, both], example: in }, status: { type: string, enum: [active, inactive, maintenance], example: active } } } } } }
 *     responses:
 *       200: { description: Gate updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Gate updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Gate' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Gates]
 *     summary: Remove a gate
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Gate removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Gate removed }, data: { nullable: true, example: null } } } ] } } } }
 * /api/manager/buildings/{buildingId}/gates/{id}/status:
 *   patch:
 *     tags: [Manager - Gates]
 *     summary: Update gate status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [active, inactive, maintenance], example: maintenance } } } } } }
 *     responses:
 *       200: { description: Gate status updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Gate status updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Gate' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/slots:
 *   get:
 *     tags: [Manager - Slots]
 *     summary: List parking slots
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: floor, schema: { type: string, format: objectId } }
 *       - { in: query, name: status, schema: { type: string, enum: [available, occupied, reserved, maintenance] } }
 *     responses:
 *       200: { description: Slots returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSlot' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Slots]
 *     summary: Create a parking slot
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [code, floor], properties: { code: { type: string, example: A-101 }, floor: { type: string, format: objectId }, status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }, reservable: { type: boolean, example: true }, note: { type: string, example: Near elevator } } } } } }
 *     responses:
 *       201: { description: Slot created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Slot created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ParkingSlot' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/slots/{id}:
 *   put:
 *     tags: [Manager - Slots]
 *     summary: Update a parking slot
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { code: { type: string, example: A-102 }, floor: { type: string, format: objectId }, status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }, reservable: { type: boolean, example: true }, note: { type: string, example: Updated note } } } } } }
 *     responses:
 *       200: { description: Slot updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Slot updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ParkingSlot' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Slots]
 *     summary: Remove a parking slot
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Slot removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Slot removed }, data: { nullable: true, example: null } } } ] } } } }
 *       409: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/slots/{id}/status:
 *   patch:
 *     tags: [Manager - Slots]
 *     summary: Update parking slot status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [available, occupied, reserved, maintenance], example: maintenance } } } } } }
 *     responses:
 *       200: { description: Slot status updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Slot status updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ParkingSlot' } } } } } ] } } } }
 */
/**
 * @swagger
 * /api/manager/buildings/{buildingId}/price-policies:
 *   get:
 *     tags: [Manager - Price Policies]
 *     summary: List price policies
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: vehicleType, schema: { type: string, format: objectId } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Price policies returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/PricePolicy' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Price Policies]
 *     summary: Create a price policy
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, vehicleType, hourlyRate], properties: { name: { type: string, example: Standard Car Rate }, vehicleType: { type: string, format: objectId }, hourlyRate: { type: number, example: 10000 }, type: { type: string, enum: [regular, peak], example: regular }, timeWindow: { type: object, properties: { from: { type: string, example: '00:00' }, to: { type: string, example: '23:59' } } }, effectiveFrom: { type: string, format: date-time }, effectiveTo: { type: string, format: date-time, nullable: true }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       201: { description: Price policy created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Price policy created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/PricePolicy' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/price-policies/{id}:
 *   put:
 *     tags: [Manager - Price Policies]
 *     summary: Update a price policy
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: Updated Car Rate }, hourlyRate: { type: number, example: 12000 }, type: { type: string, enum: [regular, peak], example: peak }, timeWindow: { type: object, properties: { from: { type: string, example: '06:00' }, to: { type: string, example: '18:00' } } }, effectiveFrom: { type: string, format: date-time }, effectiveTo: { type: string, format: date-time, nullable: true }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: Price policy updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Price policy updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/PricePolicy' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Price Policies]
 *     summary: Deactivate a price policy
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Price policy deactivated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Price policy deactivated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/PricePolicy' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/packages:
 *   get:
 *     tags: [Manager - Packages]
 *     summary: List long-term parking packages
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: vehicleType, schema: { type: string, format: objectId } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Packages returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/LongTermPackage' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Packages]
 *     summary: Create a long-term parking package
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, code, vehicleType, durationDays, price], properties: { name: { type: string, example: Monthly Car Package }, code: { type: string, example: MONTHLY-CAR }, vehicleType: { type: string, format: objectId }, durationDays: { type: integer, example: 30 }, price: { type: number, example: 1200000 }, reservedSlots: { type: integer, example: 10 }, description: { type: string, example: Monthly package }, maxHoursPerDay: { type: number, example: 8 }, allowDedicatedSlot: { type: boolean, example: true }, benefits: { type: array, items: { type: string } }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       201: { description: Package created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Package created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/LongTermPackage' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/packages/{id}:
 *   put:
 *     tags: [Manager - Packages]
 *     summary: Update a long-term parking package
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: Updated Monthly Package }, durationDays: { type: integer, example: 30 }, price: { type: number, example: 1300000 }, reservedSlots: { type: integer, example: 12 }, description: { type: string, example: Updated package }, maxHoursPerDay: { type: number, example: 8 }, allowDedicatedSlot: { type: boolean, example: true }, benefits: { type: array, items: { type: string } }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: Package updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Package updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/LongTermPackage' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Packages]
 *     summary: Remove a long-term parking package
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Package removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Package removed }, data: { nullable: true, example: null } } } ] } } } }
 * /api/manager/buildings/{buildingId}/subscriptions:
 *   get:
 *     tags: [Manager - Packages]
 *     summary: List long-term subscriptions for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, active, expired, cancelled] } }
 *     responses:
 *       200: { description: Subscriptions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 */
/**
 * @swagger
 * /api/manager/buildings/{buildingId}/reservation-policy:
 *   get:
 *     tags: [Manager - Reservation Policy]
 *     summary: Get reservation policy for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Reservation policy returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/ReservationPolicy' } } } } } ] } } } }
 *   put:
 *     tags: [Manager - Reservation Policy]
 *     summary: Create or update reservation policy
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { maxHoldMinutes: { type: integer, example: 30 }, longTermGraceDays: { type: integer, example: 7 }, maxAdvanceDays: { type: integer, example: 7 }, maxDurationHours: { type: integer, example: 24 }, refundPercent: { type: number, example: 80 }, depositPercent: { type: number, example: 15 }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: Reservation policy saved successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Reservation policy saved }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ReservationPolicy' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/shifts:
 *   get:
 *     tags: [Manager - Shifts]
 *     summary: List shift templates
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Shifts returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Shift' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Shifts]
 *     summary: Create a shift template
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, code, startTime, endTime], properties: { name: { type: string, example: Morning Shift }, code: { type: string, example: MORNING }, startTime: { type: string, example: '06:00' }, endTime: { type: string, example: '14:00' }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       201: { description: Shift created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Shift created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Shift' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/shifts/{id}:
 *   put:
 *     tags: [Manager - Shifts]
 *     summary: Update a shift template
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: Morning Shift }, code: { type: string, example: MORNING }, startTime: { type: string, example: '06:00' }, endTime: { type: string, example: '14:00' }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: Shift updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Shift updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Shift' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Shifts]
 *     summary: Remove a shift template
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Shift removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Shift removed }, data: { nullable: true, example: null } } } ] } } } }
 * /api/manager/buildings/{buildingId}/staff-shifts:
 *   get:
 *     tags: [Manager - Shifts]
 *     summary: List staff shift assignments
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: staff, schema: { type: string, format: objectId } }
 *       - { in: query, name: workDate, schema: { type: string, format: date } }
 *       - { in: query, name: status, schema: { type: string, enum: [scheduled, active, completed, cancelled] } }
 *     responses:
 *       200: { description: Staff shifts returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/StaffShift' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Shifts]
 *     summary: Assign staff to a shift
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [shift, staff, workDate], properties: { shift: { type: string, format: objectId }, staff: { type: string, format: objectId }, gate: { type: string, format: objectId }, workDate: { type: string, format: date }, status: { type: string, enum: [scheduled, active, completed, cancelled], example: scheduled }, note: { type: string, example: Entrance gate assignment } } } } } }
 *     responses:
 *       201: { description: Staff shift assigned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Staff shift assigned }, data: { type: object, properties: { item: { $ref: '#/components/schemas/StaffShift' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/staff-shifts/{id}:
 *   put:
 *     tags: [Manager - Shifts]
 *     summary: Update a staff shift assignment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { gate: { type: string, format: objectId }, status: { type: string, enum: [scheduled, active, completed, cancelled] }, note: { type: string, example: Updated assignment note } } } } } }
 *     responses:
 *       200: { description: Staff shift updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Staff shift updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/StaffShift' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Shifts]
 *     summary: Remove a staff shift assignment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Staff shift removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Staff shift removed }, data: { nullable: true, example: null } } } ] } } } }
 * /api/manager/buildings/{buildingId}/staff:
 *   get:
 *     tags: [Manager - Shifts]
 *     summary: List available staff for shift assignment
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Available staff returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/PublicUser' } } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/shift-revenues:
 *   get:
 *     tags: [Manager - Shifts]
 *     summary: List shift revenue records
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: staff, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Shift revenues returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/feedbacks:
 *   get:
 *     tags: [Manager - Feedback]
 *     summary: List feedback for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, resolved] } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *     responses:
 *       200: { description: Feedback returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Feedback' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/feedbacks/{id}:
 *   patch:
 *     tags: [Manager - Feedback]
 *     summary: Respond to feedback
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { response: { type: string, maxLength: 1000, example: Thank you for your feedback. }, staffReply: { type: string, maxLength: 1000, example: We have resolved the issue. }, status: { type: string, enum: [pending, resolved], example: resolved } } } } } }
 *     responses:
 *       200: { description: Feedback updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Feedback updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Feedback' } } } } } ] } } } }
 */
