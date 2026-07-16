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
 * /api/manager/buildings/{buildingId}/refund-policy:
 *   get:
 *     tags: [Manager - Refund Policy]
 *     summary: Get package refund policy for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Refund policy returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/ReservationPolicy' } } } } } ] } } } }
 *   put:
 *     tags: [Manager - Refund Policy]
 *     summary: Create or update package refund policy
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { refundPercent: { type: number, example: 80 }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: Refund policy saved successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Refund policy saved }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ReservationPolicy' } } } } } ] } } } }
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
