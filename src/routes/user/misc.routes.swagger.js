/**
 * @swagger
 * /api/user/parking-history:
 *   get:
 *     tags: [User - Parking History]
 *     summary: List parking history for the authenticated user
 *     description: >
 *       Both list and detail populate slot (with floor)/entryGate/exitGate and add
 *       computed checkIn/checkOut (aliases of entryTime/exitTime) and duration
 *       (minutes, null while still active) — not just on the detail endpoint.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Parking history returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSession' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/user/parking-history/{id}:
 *   get:
 *     tags: [User - Parking History]
 *     summary: Get one parking session's detail from the authenticated user's history
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Session returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { session: { $ref: '#/components/schemas/ParkingSession' } } } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/wallet:
 *   get:
 *     tags: [User - Wallet]
 *     summary: Get authenticated user wallet balance
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wallet balance returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { walletBalance: { type: number, example: 150000 } } } } } ] } } } }
 * /api/user/wallet/topup:
 *   post:
 *     tags: [User - Wallet]
 *     summary: Initiate PayOS top-up for the user wallet
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [amount], properties: { amount: { type: integer, minimum: 2000, example: 100000 } } } } } }
 *     responses:
 *       200: { description: PayOS checkout session created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Checkout session created. Redirect user to checkoutUrl to complete payment. }, data: { type: object, properties: { checkoutUrl: { type: string, example: https://pay.payos.vn/web/example }, qrCode: { type: string, example: data:image/png;base64,iVBORw0KGgo }, orderCode: { type: number, example: 123456789 }, bin: { type: string, example: '970422' }, accountNumber: { type: string, example: '1234567890' }, accountName: { type: string, example: PBMS PAYMENT }, description: { type: string, example: Wallet top-up }, amount: { type: number, example: 100000 } } } } } ] } } } }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/wallet/topup/{orderCode}/status:
 *   get:
 *     tags: [User - Wallet]
 *     summary: Verify PayOS user wallet top-up status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: orderCode, required: true, schema: { type: string }, example: '123456789' }
 *     responses:
 *       200: { description: Top-up status returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { status: { type: string, example: success }, credited: { type: boolean, example: true }, balance: { type: number, example: 250000 } } } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/wallet/transactions:
 *   get:
 *     tags: [User - Wallet]
 *     summary: List user wallet transactions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: type, schema: { type: string, enum: [debit, credit, refund] } }
 *     responses:
 *       200: { description: Wallet transactions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/WalletTransaction' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/user/long-term/packages:
 *   get:
 *     tags: [User - Long-term]
 *     summary: List active long-term parking packages
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Long-term packages returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { packages: { type: array, items: { $ref: '#/components/schemas/LongTermPackage' } } } } } } ] } } } }
 * /api/user/long-term/packages/{id}:
 *   get:
 *     tags: [User - Long-term]
 *     summary: Get one long-term package's detail
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Package returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { package: { $ref: '#/components/schemas/LongTermPackage' } } } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/long-term/subscriptions:
 *   get:
 *     tags: [User - Long-term]
 *     summary: List user long-term subscriptions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, active, expired, cancelled] } }
 *     responses:
 *       200: { description: Subscriptions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 *   post:
 *     tags: [User - Long-term]
 *     summary: Subscribe to a long-term parking package
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [packageId, plateNumber], properties: { packageId: { type: string, format: objectId }, plateNumber: { type: string, example: 59G2-038.80 }, slotId: { type: string, format: objectId }, startDate: { type: string, format: date-time } } } } } }
 *     responses:
 *       201: { description: Subscription created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Subscription created }, data: { type: object, properties: { subscription: { type: object } } } } } ] } } } }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *       409: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
/**
 * @swagger
 * /api/user/long-term/subscriptions/{id}:
 *   get:
 *     tags: [User - Long-term]
 *     summary: Get one of the authenticated user's long-term subscriptions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { subscription: { type: object, additionalProperties: true } } } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/long-term/subscriptions/{id}/cancel:
 *   post:
 *     tags: [User - Long-term]
 *     summary: Cancel a long-term parking subscription
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [cancelReason], properties: { cancelReason: { type: string, enum: [change_slot, change_vehicle, no_longer_needed, pricing_issue, other], example: no_longer_needed }, cancelNote: { type: string, example: I no longer need monthly parking. } } } } } }
 *     responses:
 *       200: { description: Subscription cancelled successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Subscription cancelled successfully }, data: { type: object, properties: { subscription: { type: object } } } } } ] } } } }
 * /api/user/long-term/subscriptions/{id}/renew:
 *   post:
 *     tags: [User - Long-term]
 *     summary: Renew a long-term parking subscription
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription renewed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Subscription renewed successfully }, data: { type: object, properties: { subscription: { type: object } } } } } ] } } } }
 * /api/user/notifications:
 *   get:
 *     tags: [User - Notifications]
 *     summary: List latest notifications for the authenticated user
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notifications returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Notification' } }, unread: { type: integer, example: 3 } } } } } ] } } } }
 * /api/user/notifications/read-all:
 *   patch:
 *     tags: [User - Notifications]
 *     summary: Mark all user notifications as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Notifications marked as read., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { ok: { type: boolean, example: true } } } } } ] } } } }
 * /api/user/notifications/{id}/read:
 *   patch:
 *     tags: [User - Notifications]
 *     summary: Mark one notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Notification marked as read., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/Notification' } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/user/buildings:
 *   get:
 *     tags: [User - Buildings]
 *     summary: List active buildings for reservation browsing
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Buildings returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Building' } } } } } } ] } } } }
 * /api/user/buildings/{buildingId}/vehicle-types:
 *   get:
 *     tags: [User - Buildings]
 *     summary: List active vehicle types for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Vehicle types returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { building: { type: object, properties: { _id: { $ref: '#/components/schemas/ObjectId' }, code: { type: string, example: CT01 }, name: { type: string, example: Central Tower Parking } } }, items: { type: array, items: { $ref: '#/components/schemas/VehicleType' } } } } } } ] } } } }
 * /api/user/buildings/{buildingId}/floors:
 *   get:
 *     tags: [User - Buildings]
 *     summary: List active floors with slot availability
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string } }
 *       - { in: query, name: vehicleTypeId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Floors returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { building: { type: object }, floors: { type: array, items: { allOf: [ { $ref: '#/components/schemas/Floor' }, { type: object, properties: { availableSlots: { type: integer, example: 50 }, occupiedSlots: { type: integer, example: 30 }, reservedSlots: { type: integer, example: 10 }, totalSlots: { type: integer, example: 90 } } } ] } } } } } } ] } } } }
 * /api/user/buildings/{buildingId}/floors/{floorId}/slots:
 *   get:
 *     tags: [User - Buildings]
 *     summary: List slots for one floor
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string } }
 *       - { in: path, name: floorId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Slots returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { floor: { type: object, properties: { _id: { $ref: '#/components/schemas/ObjectId' }, name: { type: string, example: Floor 1 }, code: { type: string, example: F1 } } }, slots: { type: array, items: { allOf: [ { $ref: '#/components/schemas/ParkingSlot' }, { type: object, properties: { selectable: { type: boolean, example: true }, owner: { type: object, nullable: true, properties: { plateNumber: { type: string, example: 59G2-038.80 }, accountName: { type: string, example: John Doe } } } } } ] } } } } } } ] } } } }
 * /api/user/feedbacks:
 *   post:
 *     tags: [User - Feedback]
 *     summary: Submit feedback for a completed parking session
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [parkingSessionId, rating, comment], properties: { buildingId: { type: string, format: objectId }, parkingSessionId: { type: string, format: objectId }, rating: { type: integer, minimum: 1, maximum: 5, example: 5 }, comment: { type: string, maxLength: 1000, example: Fast check-out and clean parking area. }, portraitImageUrl: { type: string, nullable: true }, plateImageUrl: { type: string, nullable: true } } } } } }
 *     responses:
 *       201: { description: Feedback submitted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Feedback submitted }, data: { type: object, properties: { feedback: { $ref: '#/components/schemas/Feedback' } } } } } ] } } } }
 *   get:
 *     tags: [User - Feedback]
 *     summary: Browse all feedback (public, no authentication required)
 *     description: >
 *       Mounted before the auth middleware in user/index.js — unlike the other
 *       /feedbacks routes (which authenticate per-route internally), this one is
 *       genuinely public, e.g. for showing building reviews to prospective users.
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: building, schema: { type: string, format: objectId } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *     responses:
 *       200: { description: Feedback returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Feedback' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/user/feedbacks/me:
 *   get:
 *     tags: [User - Feedback]
 *     summary: List feedback submitted by the authenticated user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, resolved] } }
 *       - { in: query, name: rating, schema: { type: integer, minimum: 1, maximum: 5 } }
 *     responses:
 *       200: { description: Feedback returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Feedback' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/user/feedbacks/{id}:
 *   delete:
 *     tags: [User - Feedback]
 *     summary: Delete a feedback the authenticated user submitted
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Feedback deleted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Feedback deleted }, data: { nullable: true, example: null } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/kiosk/package-checkin:
 *   post:
 *     tags: [Kiosk]
 *     summary: Self check-in for a long-term subscription vehicle by vehicle QR code
 *     description: >
 *       Public, unauthenticated gate-kiosk endpoint — the only state-changing route in the
 *       system that requires no auth. A long-term package driver scans their registered
 *       vehicle QR token (not a bare plate number, to prevent anyone reading a plate off a
 *       windshield) to self-admit without a staff member. Resolves the QR to its owner's
 *       plate, finds an active `LongTermSubscription` for that plate (optionally scoped to
 *       `building`), rejects if the plate already has an active session (409
 *       `DUPLICATE_PLATE`), then assigns the subscription's fixed slot if available or any
 *       free `subscriber`-usage slot in the building (409 `NO_SLOT_AVAILABLE` if none). Fee
 *       is always 0 at check-in (`paymentMethod: 'long_term'`); overage is billed at
 *       check-out like any other long-term session.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [qrCode]
 *             properties:
 *               qrCode: { type: string, example: PLT-7a9f2c11b8d4e003, description: "Vehicle QR token registered on the user's license plate (User.licensePlates[].qrCode)." }
 *               building: { type: string, format: objectId, description: Optional — scopes the subscription lookup to one building. }
 *               gate: { type: string, format: objectId }
 *               plateImage: { type: string, example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' }
 *               portraitImage: { type: string, example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ' }
 *     responses:
 *       200: { description: Checked in successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { subscription: { type: object, additionalProperties: true }, parkingSession: { $ref: '#/components/schemas/ParkingSession' } } } } } ] } } } }
 *       400: { description: KIOSK_QR_REQUIRED / KIOSK_INVALID_PLATE_FORMAT — missing or malformed qrCode. }
 *       404: { description: KIOSK_QR_NOT_FOUND (unregistered QR token) or SUBSCRIPTION_NOT_FOUND (no active package for this plate). }
 *       409: { description: DUPLICATE_PLATE (vehicle already has an active session) or NO_SLOT_AVAILABLE. }
 */

