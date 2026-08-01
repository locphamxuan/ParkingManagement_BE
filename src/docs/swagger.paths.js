/**
 * @swagger
 * components:
 *   schemas:
 *     ObjectId:
 *       type: string
 *       pattern: '^[a-fA-F0-9]{24}$'
 *       example: 665f1d2c7b0d1b0012a34567
 *
 *     ApiResponseWrapper:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Operation completed successfully
 *         data:
 *           type: object
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           example: Validation failed
 *         errorCode:
 *           type: string
 *           nullable: true
 *           example: INVALID_REQUEST
 *
 *     SuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Operation completed successfully
 *
 *     PaginationMeta:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           minimum: 1
 *           example: 1
 *         limit:
 *           type: integer
 *           minimum: 1
 *           example: 10
 *         total:
 *           type: integer
 *           example: 57
 *         totalPages:
 *           type: integer
 *           example: 6
 *
 *
 *     PublicUser:
 *       type: object
 *       properties:
 *         _id:
 *           $ref: '#/components/schemas/ObjectId'
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         fullName:
 *           type: string
 *           example: John Doe
 *         phone:
 *           type: string
 *           nullable: true
 *           example: '+84901234567'
 *         role:
 *           type: string
 *           enum: [admin, manager, staff, user]
 *           example: user
 *         avatar:
 *           type: string
 *           nullable: true
 *           example: null
 *         assignedBuildings:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ObjectId'
 *         isActive:
 *           type: boolean
 *           example: true
 *         lastLoginAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: '2026-06-12T04:35:20.000Z'
 *         walletBalance:
 *           type: number
 *           example: 150000
 *         createdAt:
 *           type: string
 *           format: date-time
 *           example: '2026-06-01T08:00:00.000Z'
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           example: '2026-06-12T04:35:20.000Z'
 *
 *     AuthPayload:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: >
 *             JWT access token. CHỈ trả về khi request khai `clientType: "mobile"` —
 *             client native không dùng được cookie nên cần token để gửi
 *             `Authorization: Bearer`. Web nhận phiên qua cookie httpOnly
 *             `pbms_token` (đã set ở header của chính phản hồi này) và cố tình
 *             KHÔNG nhận token trong body, để JavaScript không đọc được nó.
 *           example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature
 *         user:
 *           $ref: '#/components/schemas/PublicUser'
 *
 *     AuthSuccessResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Login successful
 *         data:
 *           $ref: '#/components/schemas/AuthPayload'
 *
 *     RegisterRequest:
 *       type: object
 *       description: >
 *         Step 1 of email-OTP registration. Deliberately takes NO password —
 *         the password is sent only with RegisterVerifyRequest, so it is never
 *         stored before the address is verified.
 *       required: [email, fullName]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         fullName:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: John Doe
 *         phone:
 *           type: string
 *           pattern: '^[0-9+\\-\\s()]{8,20}$'
 *           nullable: true
 *           example: '+84901234567'
 *
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         password:
 *           type: string
 *           example: Password123!
 *
 *     ForgotPasswordRequest:
 *       type: object
 *       required: [email]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *
 *     ResetPasswordRequest:
 *       type: object
 *       required: [token, newPassword]
 *       properties:
 *         token:
 *           type: string
 *           description: Plain reset token received from the reset password link.
 *           example: 3f4f0be62f845f7f4f7c14cf8791e44a1d3e0a0b89de1a6c2e44c8d7f9a12345
 *         newPassword:
 *           type: string
 *           minLength: 6
 *           example: NewPassword123!
 *
 *     RegisterVerifyRequest:
 *       type: object
 *       description: >
 *         Step 2 of email-OTP registration. The password travels only here, in
 *         the already-verified request, and is passed straight to bcrypt.
 *       required: [email, otp, password]
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@example.com
 *         otp:
 *           type: string
 *           pattern: '^\\d{6}$'
 *           example: '123456'
 *         password:
 *           type: string
 *           minLength: 12
 *           description: >
 *             At least 12 characters; common/predictable values are rejected
 *             server-side (see utils/passwordPolicy.js).
 *           example: correct-horse-battery
 *
 *     Address:
 *       type: object
 *       properties:
 *         street: { type: string, example: '123 Main Street' }
 *         ward: { type: string, example: Ben Nghe }
 *         district: { type: string, example: District 1 }
 *         city: { type: string, example: Ho Chi Minh City }
 *         fullAddress: { type: string, example: '123 Main Street, District 1, Ho Chi Minh City' }
 *
 *     OperatingHours:
 *       type: object
 *       properties:
 *         open: { type: string, example: '06:00' }
 *         close: { type: string, example: '22:00' }
 *
 *     BuildingPricing:
 *       type: object
 *       properties:
 *         hourlyRate: { type: number, example: 10000 }
 *         dailyCap: { type: number, nullable: true, example: 120000 }
 *         motorcycleMultiplier: { type: number, example: 0.6 }
 *
 *     Building:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         name: { type: string, example: Central Tower Parking }
 *         code: { type: string, example: CT01 }
 *         address: { $ref: '#/components/schemas/Address' }
 *         description: { type: string, example: Secure multi-floor parking building }
 *         manager: { $ref: '#/components/schemas/ObjectId' }
 *         totalFloors: { type: number, example: 5 }
 *         status: { type: string, enum: [active, inactive, maintenance], example: active }
 *         operatingHours: { $ref: '#/components/schemas/OperatingHours' }
 *         pricing: { $ref: '#/components/schemas/BuildingPricing' }
 *         contactPhone: { type: string, example: '+84901234567' }
 *         images:
 *           type: array
 *           items: { type: string }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     VehicleType:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: CAR }
 *         name: { type: string, example: Car }
 *         category:
 *           type: string
 *           enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
 *           example: car
 *           description: >
 *             Thể loại xe chuẩn của hệ thống mà danh mục này đại diện. Quyết định nhóm
 *             tính phí (2 bánh / 4 bánh) và việc khớp xe đã đăng ký của khách với danh
 *             mục của tòa — thay cho việc đoán theo tên/mã trước đây.
 *         description: { type: string, example: Standard passenger car }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Floor:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: F1, description: 'Auto-generated from name — read-only for clients.' }
 *         name: { type: string, example: 'Floor 1' }
 *         capacity: { type: number, example: 120 }
 *         allowedVehicleTypes:
 *           type: array
 *           items: { $ref: '#/components/schemas/ObjectId' }
 *         pricePolicy: { $ref: '#/components/schemas/ObjectId' }
 *         status: { type: string, enum: [active, inactive, maintenance], example: active }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Gate:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: GATE-IN-01 }
 *         name: { type: string, nullable: true, example: Main Entrance }
 *         direction: { type: string, enum: [in, out, both], example: in }
 *         allowedVehicleTypes:
 *           type: array
 *           items: { $ref: '#/components/schemas/ObjectId' }
 *         floors:
 *           type: array
 *           items: { $ref: '#/components/schemas/ObjectId' }
 *         status: { type: string, enum: [active, inactive, maintenance], example: active }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     ParkingSlot:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         floor: { $ref: '#/components/schemas/ObjectId' }
 *         zone: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: A-01, description: 'Auto-generated from the zone code when omitted at creation; not updatable.' }
 *         vehicleType: { $ref: '#/components/schemas/ObjectId' }
 *         usageType: { type: string, enum: [walk_in, registered, subscriber, reserved], description: 'Denormalized from the zone.' }
 *         status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }
 *         reservable: { type: boolean, example: true }
 *         note: { type: string, example: Near elevator }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Zone:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         floor: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: VL, description: 'Auto-generated from name — read-only for clients.' }
 *         name: { type: string, example: 'Walk-in zone' }
 *         vehicleType: { $ref: '#/components/schemas/ObjectId' }
 *         usageType: { type: string, enum: [walk_in, registered, subscriber, reserved], example: walk_in }
 *         capacity: { type: number, example: 20 }
 *         status: { type: string, enum: [active, inactive, maintenance], example: active }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     PricePolicy:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         vehicleType: { $ref: '#/components/schemas/ObjectId' }
 *         name: { type: string, example: Standard Car Hourly Rate }
 *         hourlyRate: { type: number, example: 10000 }
 *         type: { type: string, enum: [regular, peak], example: regular }
 *         timeWindow:
 *           type: object
 *           properties:
 *             from: { type: string, example: '00:00' }
 *             to: { type: string, example: '23:59' }
 *         effectiveFrom: { type: string, format: date-time, example: '2026-06-01T00:00:00.000Z' }
 *         effectiveTo: { type: string, format: date-time, nullable: true, example: null }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     LongTermPackage:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         vehicleType: { $ref: '#/components/schemas/ObjectId' }
 *         name: { type: string, example: Monthly Car Package }
 *         code: { type: string, example: MONTHLY-CAR }
 *         durationDays: { type: number, example: 30 }
 *         price: { type: number, example: 1200000 }
 *         reservedSlots: { type: number, example: 10 }
 *         description: { type: string, example: Monthly parking package for cars }
 *         maxHoursPerDay: { type: number, example: 8 }
 *         allowDedicatedSlot: { type: boolean, example: true }
 *         benefits:
 *           type: array
 *           items: { type: string }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     ReservationPolicy:
 *       type: object
 *       description: Package refund policy (legacy model name kept after reservation removal)
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         refundPercent: { type: number, example: 80 }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Shift:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         name: { type: string, example: Morning Shift }
 *         code: { type: string, example: MORNING }
 *         startTime: { type: string, example: '06:00' }
 *         endTime: { type: string, example: '14:00' }
 *         isActive: { type: boolean, example: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     StaffShift:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         shift: { $ref: '#/components/schemas/ObjectId' }
 *         staff: { $ref: '#/components/schemas/ObjectId' }
 *         gate: { $ref: '#/components/schemas/ObjectId' }
 *         workDate: { type: string, format: date-time, example: '2026-06-12T00:00:00.000Z' }
 *         status: { type: string, enum: [scheduled, active, completed, cancelled], example: scheduled }
 *         note: { type: string, example: Assigned to entrance gate }
 *         createdAt: { type: string, format: date-time, example: '2026-06-01T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     ParkingSession:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         slot: { $ref: '#/components/schemas/ObjectId' }
 *         vehicleType: { $ref: '#/components/schemas/ObjectId' }
 *         plateNumber: { type: string, example: 59G2-038.80 }
 *         vehicleBrand: { type: string, nullable: true, example: Toyota }
 *         user: { $ref: '#/components/schemas/ObjectId' }
 *         staff: { $ref: '#/components/schemas/ObjectId' }
 *         entryGate: { $ref: '#/components/schemas/ObjectId' }
 *         exitGate: { $ref: '#/components/schemas/ObjectId' }
 *         entryTime: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         exitTime: { type: string, format: date-time, nullable: true, example: null }
 *         fee: { type: number, example: 45000 }
 *         currentFee:
 *           type: number
 *           nullable: true
 *           example: 45000
 *           description: >
 *             Amount due right now for an ACTIVE session, recomputed from the
 *             building's active PricePolicy on every read (staff/manager list and
 *             detail endpoints). For a long-term session this is the overage fee
 *             only. `null` means no price policy is configured — never treat it
 *             as free parking; check-out is rejected with PRICE_POLICY_NOT_CONFIGURED.
 *         pricePolicyConfigured:
 *           type: boolean
 *           example: true
 *           description: Whether an active PricePolicy exists for this building + vehicle type.
 *         overageHours: { type: number, nullable: true, example: 2.5, description: Long-term sessions only — hours parked beyond the daily allowance. }
 *         maxHoursPerDay: { type: number, nullable: true, example: 8, description: Long-term sessions only — free hours per day granted by the package. }
 *         paymentMethod: { type: string, enum: [cash, wallet, qr, card, payos, long_term], nullable: true, example: wallet }
 *         status: { type: string, enum: [active, completed, cancelled], example: active }
 *         note: { type: string, example: Customer paid by wallet }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T10:00:00.000Z' }
 *
 *     Feedback:
 *       type: object
 *       description: >
 *         Full feedback record. Only returned by AUTHENTICATED, building-scoped
 *         endpoints (manager feedback list/respond) and by the owner's own
 *         GET /api/users/feedbacks/me. The unauthenticated public reviews feed
 *         returns PublicFeedback instead.
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         user: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         parkingSession: { $ref: '#/components/schemas/ObjectId' }
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         comment: { type: string, example: Fast check-out and clean parking area }
 *         status: { type: string, enum: [pending, resolved], example: pending }
 *         staffReply: { type: string, nullable: true, example: Thank you for your feedback }
 *         repliedBy: { $ref: '#/components/schemas/ObjectId' }
 *         repliedAt: { type: string, format: date-time, nullable: true, example: null }
 *         portraitImageUrl: { type: string, nullable: true, example: null }
 *         plateImageUrl: { type: string, nullable: true, example: null }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     PublicFeedback:
 *       type: object
 *       description: >
 *         Public reviews DTO for the unauthenticated GET /api/users/feedbacks feed.
 *         Deliberately carries no reviewer identity, no parking-session or plate
 *         data, no image URLs and no internal ids beyond the feedback and building.
 *         Only `resolved` feedback is published.
 *       properties:
 *         id: { $ref: '#/components/schemas/ObjectId' }
 *         rating: { type: integer, minimum: 1, maximum: 5, example: 5 }
 *         comment: { type: string, example: Fast check-out and clean parking area }
 *         building:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { $ref: '#/components/schemas/ObjectId' }
 *             name: { type: string, example: Sunrise Tower }
 *             code: { type: string, example: SRT }
 *         staffReply: { type: string, nullable: true, example: Thank you for your feedback }
 *         repliedAt: { type: string, format: date-time, nullable: true, example: null }
 *         status: { type: string, enum: [resolved], example: resolved }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Notification:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         user: { $ref: '#/components/schemas/ObjectId' }
 *         type: { type: string, example: general }
 *         title: { type: string, example: Payment received }
 *         message: { type: string, example: Your wallet top-up was successful }
 *         plateNumber: { type: string, nullable: true, example: 59G2-038.80 }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         feedback: { $ref: '#/components/schemas/ObjectId' }
 *         isRead: { type: boolean, example: false }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     WalletTransaction:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         user: { $ref: '#/components/schemas/ObjectId' }
 *         payment: { $ref: '#/components/schemas/ObjectId' }
 *         type: { type: string, enum: [debit, credit, refund], example: credit }
 *         amount: { type: number, example: 100000 }
 *         balanceAfter: { type: number, example: 250000 }
 *         status: { type: string, enum: [success, failed], example: success }
 *         reason: { type: string, example: payos_topup }
 *         metadata: { type: object, additionalProperties: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Payment:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         type: { type: string, enum: [session, reservation, subscription, penalty, refund, topup, cancellation_fee], description: 'Earned revenue uses session/subscription/penalty; refund is an outflow; topup is funding, not revenue. `reservation` is a legacy value that only appears on historical records — no new payment of that type is created.', example: session }
 *         method: { type: string, enum: [cash, wallet, qr, card, payos], example: cash }
 *         amount: { type: number, example: 45000 }
 *         status: { type: string, enum: [pending, success, failed, refunded], description: 'Cash payments start pending until a manager confirms collection via wallet/pending-cash/{paymentId}/confirm; other methods settle as success immediately.', example: success }
 *         parkingSession: { $ref: '#/components/schemas/ObjectId' }
 *         subscription: { $ref: '#/components/schemas/ObjectId' }
 *         incident: { $ref: '#/components/schemas/ObjectId', description: Set when this Payment is an incident penalty fee collected at checkout (kept separate from the parking fee itself). }
 *         user: { $ref: '#/components/schemas/ObjectId' }
 *         staff: { $ref: '#/components/schemas/ObjectId' }
 *         note: { type: string, example: '' }
 *         payosOrderCode: { type: number, nullable: true, example: 123456789 }
 *         payosPaymentLinkId: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *
 *     Incident:
 *       type: object
 *       properties:
 *         _id: { $ref: '#/components/schemas/ObjectId' }
 *         code: { type: string, example: INC-ABC123 }
 *         type: { type: string, example: slot_occupied }
 *         target: { type: string, example: 59G2-038.80 }
 *         note: { type: string, example: Someone parked in my reserved slot }
 *         building: { $ref: '#/components/schemas/ObjectId' }
 *         slot: { $ref: '#/components/schemas/ObjectId' }
 *         violatorPlate: { type: string, example: 59G2-038.80 }
 *         plateAccountFound: { type: boolean, nullable: true, description: 'null = not applicable (no violatorPlate); false auto-escalates the incident to manager-only.', example: false }
 *         resolutionNote: { type: string, example: Vehicle towed, slot freed }
 *         penaltyFee: { type: number, nullable: true, description: 'Approved only by a manager via action=penalize_violator; actually collected later at staff check-out.', example: 100000 }
 *         penaltyApprovedBy: { $ref: '#/components/schemas/ObjectId' }
 *         paymentMethod: { type: string, nullable: true, enum: [cash, wallet, qr], description: 'Set once the penalty is actually collected at staff check-out.', example: cash }
 *         payment: { $ref: '#/components/schemas/ObjectId' }
 *         severity: { type: string, enum: [medium, high, critical], example: high }
 *         status: { type: string, enum: [open, investigating, escalated, penalty_pending, resolved, closed], example: open }
 *         reportedBy: { $ref: '#/components/schemas/ObjectId' }
 *         parkingSession: { $ref: '#/components/schemas/ObjectId' }
 *         resolvedBy: { $ref: '#/components/schemas/ObjectId' }
 *         resolvedAt: { type: string, format: date-time, nullable: true, example: null }
 *         createdAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 *         updatedAt: { type: string, format: date-time, example: '2026-06-12T08:00:00.000Z' }
 */
