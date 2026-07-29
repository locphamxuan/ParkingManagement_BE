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
 * /api/manager/buildings/{buildingId}/sessions/active:
 *   get:
 *     tags: [Manager - Sessions]
 *     summary: List currently parked (active) vehicles in the building
 *     description: Realtime monitoring view — same underlying query used by staff's active-sessions list, scoped to this building.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Active sessions returned successfully.
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
 *                         items: { type: array, items: { $ref: '#/components/schemas/ParkingSession' } }
 * /api/manager/buildings/{buildingId}/sessions/{id}:
 *   get:
 *     tags: [Manager - Sessions]
 *     summary: Get one parking session's detail within the building
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
 *         description: Session returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/ParkingSession' }
 *       404: { description: SESSION_NOT_FOUND., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
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
 * /api/manager/buildings/{buildingId}/wallet/pending-cash:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: List cash payments awaiting confirmation (not yet credited to the building wallet)
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
 *     responses:
 *       200:
 *         description: Pending cash payments returned successfully.
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
 *                         items: { type: array, items: { $ref: '#/components/schemas/Payment' } }
 *                         total: { type: integer, example: 4 }
 *                         sumAmount: { type: number, example: 320000 }
 *                         pagination: { $ref: '#/components/schemas/PaginationMeta' }
 * /api/manager/buildings/{buildingId}/wallet/pending-cash/{paymentId}/confirm:
 *   post:
 *     tags: [Manager - Wallet]
 *     summary: Confirm a pending cash payment was collected, crediting the building wallet
 *     description: >
 *       Used for both the walk-in parking fee cash flow and cash-collected incident
 *       penalties (settled at check-out, see Manager - Incidents). Guarded by an
 *       atomic status:'pending' → 'success' update so two concurrent confirms only
 *       succeed once.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Cash payment confirmed and credited to the building wallet.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data: { type: object, properties: { payment: { $ref: '#/components/schemas/Payment' } } }
 *       404: { description: PENDING_CASH_NOT_FOUND — no matching pending cash payment (may already be confirmed)., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/payments:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: List every Payment recorded for a building (all methods/statuses)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: query
 *         name: method
 *         schema: { type: string, enum: [cash, wallet, qr, card, payos] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, success, failed, refunded] }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Payments returned successfully.
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
 *                         items: { type: array, items: { $ref: '#/components/schemas/Payment' } }
 *                         pagination: { $ref: '#/components/schemas/PaginationMeta' }
 * /api/manager/buildings/{buildingId}/wallet/revenue-breakdown:
 *   get:
 *     tags: [Manager - Wallet]
 *     summary: Revenue broken down by day and payment method
 *     description: >
 *       Source is successful revenue-type Payments only (parking_fee/subscription_fee/
 *       penalty_fee — top-ups excluded), so `allTimeTotal` differs from the wallet's
 *       `totalReceived`. Days are bucketed in the server's local timezone, not UTC.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: buildingId
 *         required: true
 *         schema: { type: string, format: objectId }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Revenue breakdown returned successfully.
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
 *                         allTimeTotal: { type: number, example: 15000000 }
 *                         days:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date: { type: string, example: '2026-07-20' }
 *                               total: { type: number, example: 1250000 }
 *                               byMethod:
 *                                 type: object
 *                                 properties:
 *                                   cash: { type: number, example: 300000 }
 *                                   wallet: { type: number, example: 700000 }
 *                                   online: { type: number, example: 250000 }
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
