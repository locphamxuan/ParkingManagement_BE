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
 *     summary: Get the building's refund policy (read-only)
 *     description: >
 *       Used internally by staff tooling to show the building's cancellation refund
 *       percentage. Not the same endpoint as the manager's GET/PUT refund-policy (that
 *       one requires manager/admin role). Violation penalty fees are no longer part of
 *       this policy — see GET /api/manager/buildings/{buildingId}/violation-types.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId }, description: buildingId }
 *     responses:
 *       200: { description: Policy returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { refundPercent: { type: number, example: 80 } } } } } ] } } } }
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
 * components:
 *   schemas:
 *     StaffQrSession:
 *       type: object
 *       description: Minimal active-session summary for gate operations (no fee, no PII).
 *       properties:
 *         id: { type: string, format: objectId }
 *         plateNumber: { type: string, example: 59G2-038.80 }
 *         entryTime: { type: string, format: date-time }
 *     StaffQrPackage:
 *       type: object
 *       properties:
 *         id: { type: string, format: objectId }
 *         name: { type: string, example: Gói tháng }
 *         code: { type: string, nullable: true }
 *         plateNumber: { type: string, example: 59G2-038.80 }
 *         startDate: { type: string, format: date-time }
 *         endDate: { type: string, format: date-time }
 *     StaffPlateLookup:
 *       type: object
 *       description: >
 *         What the gate learns about one plate INSIDE the selected building. Like every
 *         other staff lookup it carries no email, phone or wallet balance — only the
 *         display name. Note `registeredVehicleKind` (the 2-wheel/4-wheel group used for
 *         slot matching and pricing), which is a different field from the detailed
 *         `registeredVehicle.category`.
 *       properties:
 *         plateNumber: { type: string, example: 59G2-038.80, description: Canonical VN form. }
 *         hasAccount: { type: boolean, example: true }
 *         usageType:
 *           type: string
 *           enum: [walk_in, registered, subscriber]
 *           description: Feed this back into /free-slots so the slot pool matches check-in.
 *         registeredVehicleKind:
 *           type: string
 *           nullable: true
 *           enum: [car, motorcycle]
 *         registeredVehicle:
 *           type: object
 *           nullable: true
 *           properties:
 *             category: { type: string, enum: [motorcycle, ebike, emotorbike, car, suv, truck, other] }
 *             categoryLabel: { type: string, nullable: true, example: Ô tô }
 *             brand: { type: string, nullable: true, example: Toyota }
 *         user:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { $ref: '#/components/schemas/ObjectId' }
 *             fullName: { type: string, example: Nguyễn Văn A }
 *         activeSession:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { $ref: '#/components/schemas/ObjectId' }
 *             building: { $ref: '#/components/schemas/ObjectId' }
 *             entryTime: { type: string, format: date-time }
 *         hasActivePackage: { type: boolean }
 *         activePackage:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { $ref: '#/components/schemas/ObjectId' }
 *             name: { type: string, example: Gói tháng }
 *             maxHoursPerDay: { type: number, example: 12 }
 *             slot:
 *               type: object
 *               nullable: true
 *               description: Fixed slot bought with the package; null means staff must assign a free one.
 *               properties:
 *                 id: { $ref: '#/components/schemas/ObjectId' }
 *                 code: { type: string, example: A-12 }
 *                 status: { type: string }
 *                 floor:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     name: { type: string }
 *                     code: { type: string }
 * /api/staff/users/lookup-qr/{qrCode}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Look up a user by QR code (account QR), scoped to one building
 *     description: >
 *       `building` is REQUIRED and must be a building the staff member is assigned to;
 *       there is no fallback to all assigned buildings. The response is minimized for
 *       gate operations — it never contains email, phone, walletBalance or the customer's other vehicles.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCode
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: building
 *         required: true
 *         description: The currently selected building. Missing → 400 BUILDING_REQUIRED.
 *         schema: { type: string, format: objectId }
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
 *                         userId: { type: string, format: objectId }
 *                         hasAccount: { type: boolean }
 *                         user:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             id: { type: string, format: objectId }
 *                             fullName: { type: string }
 *                             isActive: { type: boolean }
 *                         activeSessions:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/StaffQrSession' }
 *                         activePackages:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/StaffQrPackage' }
 *       400: { description: BUILDING_REQUIRED — query parameter `building` is missing., $ref: '#/components/responses/ValidationError' }
 *       403: { description: FORBIDDEN_BUILDING_SCOPE — building is not assigned to this staff member., $ref: '#/components/responses/ForbiddenError' }
 * /api/staff/users/lookup-plate-qr/{qrCode}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Look up a vehicle by its QR token, scoped to one building
 *     description: >
 *       `building` is REQUIRED and must be assigned to the staff member. Only the
 *       scanned vehicle is returned — never the owner's identity, contact details or
 *       their other registered vehicles. A token older than VEHICLE_QR_TTL_DAYS
 *       (default 2 days) is rejected with 410 VEHICLE_QR_EXPIRED — exactly the same
 *       rule the unmanned kiosk applies, so both scanners never diverge.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: qrCode
 *         required: true
 *         schema: { type: string, example: PLT-abc123 }
 *       - in: query
 *         name: building
 *         required: true
 *         description: The currently selected building. Missing → 400 BUILDING_REQUIRED.
 *         schema: { type: string, format: objectId }
 *     responses:
 *       200:
 *         description: Vehicle lookup returned successfully.
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
 *                         qrCode: { type: string }
 *                         found: { type: boolean }
 *                         vehicle:
 *                           type: object
 *                           properties:
 *                             plateNumber: { type: string, example: 59G2-038.80 }
 *                             category: { type: string, enum: [motorcycle, ebike, emotorbike, car, suv, truck, other], example: car }
 *                             categoryLabel: { type: string, example: Ô tô }
 *                             brand: { type: string, nullable: true, example: Toyota }
 *                         activeSessions:
 *                           type: array
 *                           items: { $ref: '#/components/schemas/StaffQrSession' }
 *       400: { description: BUILDING_REQUIRED — query parameter `building` is missing., $ref: '#/components/responses/ValidationError' }
 *       403: { description: FORBIDDEN_BUILDING_SCOPE — building is not assigned to this staff member., $ref: '#/components/responses/ForbiddenError' }
 *       404: { description: VEHICLE_QR_NOT_FOUND — the token matches no registered vehicle. }
 *       410: { description: VEHICLE_QR_EXPIRED — the token is past its lifetime; the driver must reopen the app to get a new one. }
 * /api/staff/users/resolve-qr/{code}:
 *   get:
 *     tags: [Staff - Users Lookup]
 *     summary: Resolve a QR payload to either account or vehicle data, scoped to one building
 *     description: >
 *       `building` is REQUIRED and is applied to BOTH branches (`PLT-` plate token and
 *       account ObjectId). Response is the matching lookup payload tagged with `kind`.
 *       `kind` is `vehicle` for a `PLT-` token — the payload then carries the scanned
 *       car under `vehicle` (with `category`, NOT `vehicleType`) — and `user` for an
 *       account ObjectId. Neither branch returns email, phone or wallet balance.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: building
 *         required: true
 *         description: The currently selected building. Missing → 400 BUILDING_REQUIRED.
 *         schema: { type: string, format: objectId }
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
 *                       oneOf:
 *                         - type: object
 *                           description: A `PLT-` vehicle token — same payload as /lookup-plate-qr.
 *                           properties:
 *                             kind: { type: string, enum: [vehicle] }
 *                             qrCode: { type: string, example: PLT-abc123 }
 *                             found: { type: boolean }
 *                             vehicle:
 *                               type: object
 *                               properties:
 *                                 plateNumber: { type: string, example: 59G2-038.80 }
 *                                 category: { type: string, enum: [motorcycle, ebike, emotorbike, car, suv, truck, other], example: car }
 *                                 categoryLabel: { type: string, nullable: true, example: Ô tô }
 *                                 brand: { type: string, nullable: true, example: Toyota }
 *                             activeSessions:
 *                               type: array
 *                               items: { $ref: '#/components/schemas/StaffQrSession' }
 *                         - type: object
 *                           description: An account ObjectId — same payload as /lookup-qr.
 *                           properties:
 *                             kind: { type: string, enum: [user] }
 *                             userId: { $ref: '#/components/schemas/ObjectId' }
 *                             hasAccount: { type: boolean }
 *                             user:
 *                               type: object
 *                               nullable: true
 *                               properties:
 *                                 id: { $ref: '#/components/schemas/ObjectId' }
 *                                 fullName: { type: string }
 *                                 isActive: { type: boolean }
 *                             activeSessions:
 *                               type: array
 *                               items: { $ref: '#/components/schemas/StaffQrSession' }
 *                             activePackages:
 *                               type: array
 *                               items: { $ref: '#/components/schemas/StaffQrPackage' }
 *       400: { description: BUILDING_REQUIRED / INVALID_QR_CODE., $ref: '#/components/responses/ValidationError' }
 *       403: { description: FORBIDDEN_BUILDING_SCOPE — building is not assigned to this staff member., $ref: '#/components/responses/ForbiddenError' }
 */
/**
 * @swagger
 * /api/staff/parking-sessions/check-in:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Check in a vehicle
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [building, plateNumber], properties: { building: { type: string, format: objectId }, slot: { type: string, format: objectId }, vehicleType: { type: string, format: objectId }, plateNumber: { type: string, example: 59G2-038.80 }, vehicleBrand: { type: string, example: Toyota }, entryGate: { type: string, format: objectId }, identificationMethod: { type: string, enum: [plate, qr], description: QR identification stores no plate image }, plateImage: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ }, portraitImage: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ }, note: { type: string, example: Manual check-in } } } } } }
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
 *     summary: Look up the owner, registered vehicle and long-term package of a plate
 *     description: >
 *       `building` is REQUIRED — an open session, a package and its fixed slot only mean
 *       anything inside one building. No wallet balance or contact detail is returned.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: plate, required: true, schema: { type: string }, example: 59G2-038.80 }
 *       - { in: query, name: building, required: true, schema: { type: string, format: objectId }, description: Missing → 400 BUILDING_REQUIRED. }
 *     responses:
 *       200: { description: Plate lookup returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/StaffPlateLookup' } } } ] } } } }
 *       400: { description: BUILDING_REQUIRED — query parameter `building` is missing., $ref: '#/components/responses/ValidationError' }
 * /api/staff/parking-sessions/scan:
 *   post:
 *     tags: [Staff - Parking Sessions]
 *     summary: Recognize a plate from a camera frame and resolve the vehicle's account
 *     description: >
 *       `image` MUST be a full data URL (`data:image/jpeg;base64,...`). The declared MIME
 *       type is checked against the file's magic bytes before anything is forwarded to an
 *       OCR provider, so a bare base64 string is rejected with 400 IMAGE_MALFORMED.
 *       Allowed types are image/jpeg, image/png and image/webp, up to 3MB decoded.
 *       `building` is REQUIRED in the body.
 *
 *       Plate recognition is assistive, never a gate blocker: when the configured OCR
 *       provider is down the response is still 200 with `scanStatus: "unavailable"` and an
 *       empty `plateNumber`, so staff fall back to manual entry. Only a malformed payload
 *       is a hard 4xx. With the PaddleOCR provider `vehicleType` and `brand` are always
 *       null — it reads text only, and staff pick the vehicle type in the UI.
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [image, building], properties: { image: { type: string, example: data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ }, building: { type: string, format: objectId } } } } } }
 *     responses:
 *       200:
 *         description: Scan result returned successfully (including the degraded manual-entry fallback).
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       allOf:
 *                         - $ref: '#/components/schemas/StaffPlateLookup'
 *                         - type: object
 *                           properties:
 *                             scanStatus:
 *                               type: string
 *                               enum: [available, unavailable]
 *                               description: '`unavailable` = OCR provider outage; plateNumber is empty and staff type it in.'
 *                             plateConfidence: { type: number, format: float, example: 0.97 }
 *                             vehicleType: { type: string, nullable: true, enum: [car, motorcycle], description: Detected by the provider; always null on PaddleOCR. }
 *                             brand: { type: string, nullable: true, example: Toyota }
 *                             brandConfidence: { type: number, format: float, example: 0.81 }
 *                             vehicleTypeMismatch: { type: boolean, description: True only when BOTH the detected and the registered kind are known and differ. }
 *       400: { description: BUILDING_REQUIRED / IMAGE_MALFORMED / IMAGE_TYPE_UNSUPPORTED / IMAGE_BASE64_INVALID / IMAGE_TYPE_MISMATCH., $ref: '#/components/responses/ValidationError' }
 *       413: { description: IMAGE_TOO_LARGE — the decoded frame is over 3MB. }
 *       429: { description: Too many scans from this staff account. }
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
 *     description: >-
 *       Closes an active session and settles what is due. The parking fee and an approved pending
 *       penalty are separate receivables and may use different methods. When paymentMethod is
 *       `payos` (the parking fee was already paid through the PayOS QR) and the plate has a penalty
 *       that was approved after the QR was created, `penaltyPaymentMethod` (cash or wallet) is
 *       required so the penalty is still collected at the gate — otherwise the request fails with
 *       `PENALTY_PAYMENT_METHOD_REQUIRED` and nothing is committed.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { exitGate: { type: string, format: objectId }, paymentMethod: { type: string, enum: [cash, wallet, qr, card, payos, long_term] }, penaltyPaymentMethod: { type: string, enum: [cash, wallet], description: 'Method used to collect an approved pending penalty. Required when paymentMethod is payos and a penalty is pending; defaults to paymentMethod otherwise.' }, exitPlateImage: { type: string }, exitPortraitImage: { type: string }, note: { type: string, example: Paid by cash } } } } } }
 *     responses:
 *       200: { description: Session checked out successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { $ref: '#/components/schemas/ParkingSession' } } } ] } } } }
 * /api/staff/parking-sessions/{id}/payment-intent:
 *   get:
 *     tags: [Staff - Parking Sessions]
 *     summary: Read the live PayOS intent of an active session
 *     description: >
 *       Trả ý định thanh toán PayOS còn sống của phiên (tối đa 1 mỗi phiên, theo unique
 *       index `uniq_live_payos_session_intent`) để staff mở lại đúng mã QR cũ thay vì tạo
 *       mã thứ hai. Intent đang `pending` được đối soát lại với PayOS trước khi trả về.
 *       `data` = null khi phiên chưa có intent nào còn sống.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Payment intent returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, nullable: true, properties: { status: { type: string, enum: [pending, success] }, orderCode: { type: number }, checkoutUrl: { type: string }, qrCode: { type: string }, amount: { type: number }, plateNumber: { type: string, example: 59G2-038.80 } } } } } ] } } } }
 *       400: { description: "Phiên không còn active (SESSION_NOT_ACTIVE)" }
 *       404: { description: "Không tìm thấy phiên (SESSION_NOT_FOUND)" }
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
