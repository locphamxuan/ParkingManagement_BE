/**
 * @swagger
 * /api/staff/dashboard:
 *   get:
 *     tags: [Staff - Dashboard]
 *     summary: Get staff dashboard overview
 *     description: Returns assigned-building counts and basic dashboard information for the authenticated staff account.
 *     security:
 *       - bearerAuth: []
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
 *                     message: { type: string, example: Dashboard data retrieved successfully }
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           type: object
 *                           properties:
 *                             id: { $ref: '#/components/schemas/ObjectId' }
 *                             fullName: { type: string, example: Tran Van Staff }
 *                             email: { type: string, format: email, example: staff@example.com }
 *                             role: { type: string, example: staff }
 *                             lastLoginAt: { type: string, format: date-time, nullable: true }
 *                         summary:
 *                           type: object
 *                           properties:
 *                             assignedBuildingCount: { type: integer, example: 2 }
 *                             activeBuildingCount: { type: integer, example: 1 }
 *                             maintenanceBuildingCount: { type: integer, example: 1 }
 *                         buildings:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Building' }
 *       401: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/staff/buildings:
 *   get:
 *     tags: [Staff - Dashboard]
 *     summary: List buildings assigned to the authenticated staff member
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned buildings returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Assigned buildings retrieved successfully }
 *                     data:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/Building' }
 *                         meta:
 *                           type: object
 *                           properties:
 *                             total: { type: integer, example: 2 }
 * /api/staff/buildings/{id}:
 *   get:
 *     tags: [Staff - Dashboard]
 *     summary: Get one assigned building
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Assigned building returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: Building details retrieved successfully }
 *                     data:
 *                       type: object
 *                       properties:
 *                         building: { $ref: '#/components/schemas/Building' }
 *       403: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/staff/buildings/{id}/policy:
 *   get:
 *     tags: [Staff - Dashboard]
 *     summary: Get the building's refund/violation policy (read-only, internal use for penalty amounts)
 *     description: >
 *       Used internally by staff tooling to show the standard violation penalty
 *       (ruleViolationFee) — the same default a manager's action=penalize_violator
 *       falls back to when no explicit penaltyFee is given. Not the same endpoint as
 *       the manager's GET/PUT refund-policy (that one requires manager/admin role).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId }, description: buildingId }
 *     responses:
 *       200: { description: Policy returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { refundPercent: { type: number, example: 80 }, ruleViolationFee: { type: number, example: 100000 } } } } } ] } } } }
 * /api/staff/my-shifts:
 *   get:
 *     tags: [Staff - Shifts]
 *     summary: List the authenticated staff member's shifts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, active, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Staff shifts returned successfully.
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
 *                           items: { $ref: '#/components/schemas/StaffShift' }
 * /api/staff/users/lookup-qr/{qrCode}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Look up a user by QR code
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User lookup returned successfully.
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
 *                         user: { $ref: '#/components/schemas/PublicUser' }
 *                         activeSessions:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/ParkingSession' }
 * /api/staff/users/lookup-plate-qr/{qrCode}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Look up a license plate by QR token
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCode
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Plate lookup returned successfully.
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
 *                         plate: { $ref: '#/components/schemas/LicensePlate' }
 *                         owner: { $ref: '#/components/schemas/PublicUser' }
 *                         activeSessions:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/ParkingSession' }
 * /api/staff/users/resolve-qr/{code}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Resolve a QR payload to either account or vehicle data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: QR resolution returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       additionalProperties: true
 */
/**
 * @swagger
 * /api/staff/parking-sessions/check-in:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Check in a vehicle
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [building, plateNumber], properties: { building: { type: string, format: objectId }, slot: { type: string, format: objectId }, vehicleType: { type: string, format: objectId }, plateNumber: { type: string, example: 59G2-038.80 }, vehicleBrand: { type: string, example: Toyota }, entryGate: { type: string, format: objectId }, plateImage: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ }, portraitImage: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ }, note: { type: string, example: Manual check-in } } } } } }
 *     responses:
 *       200: { description: Parking session created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/ParkingSession' } } } ] } } } }
 * /api/staff/parking-sessions/active:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: List active parking sessions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *       - { in: query, name: plate, schema: { type: string } }
 *     responses:
 *       200: { description: Active sessions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSession' } } } } } } ] } } } }
 * /api/staff/parking-sessions/free-slots:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: List available slots filtered by the usageType fallback chain, with a suggested slot
 *     description: >
 *       Filters 'available' slots by the one-directional usageType fallback chain
 *       (walk_in never encroaches on registered/subscriber/reserved slots; those
 *       classes may fall back to a walk_in slot when their own pool is empty).
 *       vehicleType is used only for ranking the suggestion, not for filtering.
 *       totalSlots/totalAvailable count the WHOLE building without the usageType
 *       filter, so the FE can distinguish "no dedicated slots in this building" from
 *       "dedicated slots exist but are all held for another usage class" from "full".
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: building, schema: { type: string, format: objectId } }
 *       - { in: query, name: vehicleType, schema: { type: string, format: objectId }, description: Used for ranking only — does not filter results. }
 *       - { in: query, name: usageType, schema: { type: string, enum: [walk_in, registered, subscriber, reserved] } }
 *     responses:
 *       200:
 *         description: Free slots returned successfully.
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
 *                         items: { type: array, items: { $ref: '#/components/schemas/ParkingSlot' } }
 *                         suggestedSlotId: { $ref: '#/components/schemas/ObjectId' }
 *                         totalSlots: { type: integer, example: 120, description: Whole-building slot count, not filtered by usageType. }
 *                         totalAvailable: { type: integer, example: 34, description: Whole-building available-slot count, not filtered by usageType. }
 * /api/staff/parking-sessions/my-checkins:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: List today's check-ins performed by the authenticated staff member
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: building, schema: { type: string, format: objectId } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Check-ins returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSession' } } } } } } ] } } } }
 * /api/staff/parking-sessions/search:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: Search parking sessions by plate or filters
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: plate, schema: { type: string, example: 59G2-038.80 } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, completed, cancelled] } }
 *     responses:
 *       200: { description: Sessions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSession' } } } } } } ] } } } }
 * /api/staff/parking-sessions/lookup-plate/{plate}:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: Look up account and wallet details by license plate
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: plate, required: true, schema: { type: string }, example: 59G2-038.80 }
 *     responses:
 *       200: { description: Plate lookup returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { hasAccount: { type: boolean, example: true }, user: { $ref: '#/components/schemas/PublicUser' }, walletBalance: { type: number, example: 150000 } } } } } ] } } } }
 * /api/staff/parking-sessions/scan:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Scan vehicle image for plate and brand recognition
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [image], properties: { image: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ } } } } } }
 *     responses:
 *       200: { description: Scan result returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { plateNumber: { type: string, example: 59G2-038.80 }, brand: { type: string, example: Toyota }, hasAccount: { type: boolean, example: true }, user: { $ref: '#/components/schemas/PublicUser' } } } } } ] } } } }
 * /api/staff/parking-sessions/reject:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Reject a check-in or check-out attempt
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [plateNumber, stage, reason], properties: { plateNumber: { type: string, example: 59G2-038.80 }, stage: { type: string, enum: [check-in, check-out], example: check-in }, reason: { type: string, example: Plate image does not match the account vehicle. }, building: { type: string, format: objectId } } } } } }
 *     responses:
 *       200: { description: Rejection notification processed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Rejection processed and notification sent if an account exists. }, data: { type: object, additionalProperties: true } } } ] } } } }
 * /api/staff/parking-sessions/{id}/check-out:
 *   patch:
 *     tags: [Staff - Parking Sessions]
 *     summary: Check out a parking session
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { exitGate: { type: string, format: objectId }, paymentMethod: { type: string, enum: [cash, wallet, qr, card, payos, long_term] }, exitPlateImage: { type: string }, exitPortraitImage: { type: string }, note: { type: string, example: Paid by cash } } } } } }
 *     responses:
 *       200: { description: Session checked out successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/ParkingSession' } } } ] } } } }
 * /api/staff/parking-sessions/{id}/initiate-payment:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Create a PayOS payment link for a session fee
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Payment link created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: PayOS payment link created }, data: { type: object, properties: { checkoutUrl: { type: string }, qrCode: { type: string }, orderCode: { type: number }, amount: { type: number } } } } } ] } } } }
 * /api/staff/parking-sessions/payment/{orderCode}/status:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: Verify PayOS session payment status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: orderCode, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Payment status returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { status: { type: string, example: success }, paid: { type: boolean, example: true }, session: { $ref: '#/components/schemas/ParkingSession' } } } } } ] } } } }
 * /api/staff/parking-sessions/{id}:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: Get parking session details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Session returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/ParkingSession' } } } ] } } } }
 * /api/staff/wallet-transactions:
 *   post:
 *     tags: [Staff - Wallet Transactions]
 *     summary: Process an internal wallet transaction
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [amount], properties: { sessionId: { type: string, format: objectId }, userId: { type: string, format: objectId }, amount: { type: number, minimum: 1, example: 45000 } } } } } }
 *     responses:
 *       200: { description: Wallet transaction processed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Internal wallet payment processed successfully }, data: { type: object, additionalProperties: true } } } ] } } } }
 */
