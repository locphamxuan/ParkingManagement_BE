/**
 * @swagger
 * /api/admin/buildings:
 *   get:
 *     tags: [Admin - Buildings]
 *     summary: List buildings across the platform
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 500, default: 10 } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, inactive, maintenance] } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: search, schema: { type: string }, description: Search by building name, code, or address. }
 *     responses:
 *       200: { description: Buildings returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Building' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Create a building
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, code, totalFloors, pricing, operatingHours], properties: { name: { type: string, example: Central Tower Parking }, code: { type: string, example: CT01 }, address: { $ref: '#/components/schemas/Address' }, description: { type: string, example: Secure parking building }, totalFloors: { type: integer, minimum: 1, example: 5 }, status: { type: string, enum: [active, inactive, maintenance], example: active }, operatingHours: { $ref: '#/components/schemas/OperatingHours' }, pricing: { $ref: '#/components/schemas/BuildingPricing' }, contactPhone: { type: string, example: '+84901234567' }, images: { type: array, items: { type: string } } } } } } }
 *     responses:
 *       201: { description: Building created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Building created successfully }, data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/admin/buildings/{id}:
 *   get:
 *     tags: [Admin - Buildings]
 *     summary: Get building details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Building returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 *       404: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 *   put:
 *     tags: [Admin - Buildings]
 *     summary: Update a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: Central Tower Parking }, code: { type: string, example: CT01 }, address: { $ref: '#/components/schemas/Address' }, totalFloors: { type: integer, minimum: 1, example: 6 }, status: { type: string, enum: [active, inactive, maintenance], example: active }, operatingHours: { $ref: '#/components/schemas/OperatingHours' }, pricing: { $ref: '#/components/schemas/BuildingPricing' }, contactPhone: { type: string, example: '+84901234567' }, images: { type: array, items: { type: string } } } } } } }
 *     responses:
 *       200: { description: Building updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Building updated successfully }, data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 *   delete:
 *     tags: [Admin - Buildings]
 *     summary: Delete a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Building deleted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Building deleted successfully }, data: { nullable: true, example: null } } } ] } } } }
 * /api/admin/buildings/{id}/members:
 *   get:
 *     tags: [Admin - Buildings]
 *     summary: Get building manager, staff, and subscription status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Building members returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { manager: { $ref: '#/components/schemas/PublicUser' }, staff: { type: array, items: { $ref: '#/components/schemas/PublicUser' } }, subscription: { type: object, additionalProperties: true } } } } } ] } } } }
 * /api/admin/buildings/{id}/status:
 *   patch:
 *     tags: [Admin - Buildings]
 *     summary: Update building status
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [status], properties: { status: { type: string, enum: [active, inactive, maintenance], example: maintenance } } } } } }
 *     responses:
 *       200: { description: Building status updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Building status updated successfully }, data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 */
/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List users on the platform
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { in: query, name: role, schema: { type: string, enum: [customer, manager, staff, admin] } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *       - { in: query, name: search, schema: { type: string }, description: Search by name, email, or phone. }
 *     responses:
 *       200: { description: Users returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/PublicUser' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 *   post:
 *     tags: [Admin - Users]
 *     summary: Create a user
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [email, password, fullName, role], properties: { email: { type: string, format: email, example: newuser@example.com }, password: { type: string, minLength: 8, example: password123 }, fullName: { type: string, example: Nguyen Van A }, phoneNumber: { type: string, example: 0901234567 }, role: { type: string, enum: [customer, manager, staff, admin], example: manager }, buildingId: { type: string, format: objectId }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       201: { description: User created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: User created successfully }, data: { type: object, properties: { user: { $ref: '#/components/schemas/PublicUser' } } } } } ] } } } }
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Get user details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: User returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { user: { $ref: '#/components/schemas/PublicUser' } } } } } ] } } } }
 *   put:
 *     tags: [Admin - Users]
 *     summary: Update a user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { email: { type: string, format: email }, fullName: { type: string, example: Nguyen Van A }, phoneNumber: { type: string, example: 0901234567 }, role: { type: string, enum: [customer, manager, staff, admin], example: manager }, buildingId: { type: string, format: objectId }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       200: { description: User updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: User updated successfully }, data: { type: object, properties: { user: { $ref: '#/components/schemas/PublicUser' } } } } } ] } } } }
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Delete a user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: User deleted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: User deleted successfully }, data: { nullable: true, example: null } } } ] } } } }
 * /api/admin/users/{id}/wallet:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Adjust user wallet balance
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [amount], properties: { amount: { type: number, example: 50000 }, reason: { type: string, example: Admin credit adjustment } } } } } }
 *     responses:
 *       200: { description: Wallet adjusted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Wallet adjustment successful }, data: { type: object, additionalProperties: true } } } ] } } } }
 * /api/admin/buildings/{buildingId}/assign-staff:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Assign staff to a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [staffIds], properties: { staffIds: { type: array, items: { type: string, format: objectId } } } } } } }
 *     responses:
 *       200: { description: Staff assigned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Staff assigned successfully }, data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 * /api/admin/buildings/{buildingId}/assign-manager:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Assign a manager to a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [managerId], properties: { managerId: { type: string, format: objectId } } } } } }
 *     responses:
 *       200: { description: Manager assigned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Manager assigned successfully }, data: { type: object, properties: { building: { $ref: '#/components/schemas/Building' } } } } } ] } } } }
 * /api/admin/notifications:
 *   post:
 *     tags: [Admin - Notifications]
 *     summary: Send a platform-wide notification
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [title, body, type], properties: { title: { type: string, example: Platform Maintenance }, body: { type: string, example: System will be down on Saturday. }, type: { type: string, enum: [system, parking, wallet, promotion, shift, feedback, incident, building, reservation, violation, emergency], example: system }, targetUserIds: { type: array, items: { type: string, format: objectId } }, targetRole: { type: string, enum: [customer, manager, staff, admin], example: customer } } } } } }
 *     responses:
 *       200: { description: Notification sent successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Notification sent successfully }, data: { type: object, properties: { notificationsSent: { type: integer, example: 120 } } } } } ] } } } }
 * /api/admin/audit-logs:
 *   get:
 *     tags: [Admin - Audit Logs]
 *     summary: Retrieve platform audit logs
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: userId, schema: { type: string, format: objectId } }
 *       - { in: query, name: action, schema: { type: string }, description: Filter by action type. }
 *       - { in: query, name: resource, schema: { type: string }, description: Filter by resource type. }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200: { description: Audit logs returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object, properties: { _id: { $ref: '#/components/schemas/ObjectId' }, user: { $ref: '#/components/schemas/ObjectId' }, userName: { type: string, example: admin@example.com }, role: { type: string, example: admin }, action: { type: string, example: CREATE }, resource: { type: string, example: Building }, resourceId: { type: string, nullable: true }, details: { type: object, additionalProperties: true }, ipAddress: { type: string, example: '192.168.1.1' }, userAgent: { type: string, example: Mozilla/5.0 }, performedAt: { type: string, format: date-time } } } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 */
/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Get admin dashboard metrics
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *     responses:
 *       200: { description: Dashboard metrics returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { buildings: { type: object, properties: { total: { type: integer, example: 8 }, active: { type: integer, example: 6 }, maintenance: { type: integer, example: 1 }, inactive: { type: integer, example: 1 } } }, users: { type: object, properties: { total: { type: integer, example: 520 }, customer: { type: integer, example: 470 }, manager: { type: integer, example: 30 }, staff: { type: integer, example: 18 }, admin: { type: integer, example: 2 } } }, sessions: { type: object, properties: { active: { type: integer, example: 45 }, completedToday: { type: integer, example: 65 }, totalToday: { type: integer, example: 110 } } }, revenue: { type: object, properties: { today: { type: number, example: 2500000 }, month: { type: number, example: 35000000 }, total: { type: number, example: 150000000 } } }, wallet: { type: object, properties: { systemBalance: { type: number, example: 50000000 } } } } } } } ] } } } }
 */
/**
 * @swagger
 * /api/admin/revenue:
 *   get:
 *     tags: [Admin - Revenue]
 *     summary: Get system revenue report
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Revenue report returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, additionalProperties: true } } } ] } } } }
 * /api/admin/revenue/subscriptions:
 *   get:
 *     tags: [Admin - Revenue]
 *     summary: List manager subscription transfer revenue
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: from, schema: { type: string, format: date } }
 *       - { in: query, name: to, schema: { type: string, format: date } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription transfers returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, additionalProperties: true } } } ] } } } }
 * /api/admin/wallet:
 *   get:
 *     tags: [Admin - Wallet]
 *     summary: Get system wallet
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: System wallet returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { wallet: { type: object, properties: { _id: { $ref: '#/components/schemas/ObjectId' }, balance: { type: number, example: 50000000 }, totalDistributed: { type: number, example: 40000000 }, createdAt: { type: string, format: date-time }, updatedAt: { type: string, format: date-time } } } } } } } ] } } } }
 * /api/admin/wallet/topup:
 *   post:
 *     tags: [Admin - Wallet]
 *     summary: Manually top up the system wallet
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [amount], properties: { amount: { type: number, minimum: 1, example: 1000000 } } } } } }
 *     responses:
 *       200: { description: Wallet topped up successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Wallet topped up }, data: { type: object, properties: { wallet: { type: object } } } } } ] } } } }
 * /api/admin/wallet/distribute:
 *   post:
 *     tags: [Admin - Wallet]
 *     summary: Distribute system wallet revenue to a building wallet
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [buildingId, amount, periodStart, periodEnd], properties: { buildingId: { type: string, format: objectId }, amount: { type: number, minimum: 1, example: 500000 }, periodStart: { type: string, format: date-time }, periodEnd: { type: string, format: date-time }, note: { type: string, example: Monthly distribution } } } } } }
 *     responses:
 *       201: { description: Revenue distributed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Revenue distributed successfully }, data: { type: object, properties: { wallet: { type: object }, distribution: { type: object } } } } } ] } } } }
 * /api/admin/wallet/distributions:
 *   get:
 *     tags: [Admin - Wallet]
 *     summary: List revenue distributions
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Distributions returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/admin/price-policies:
 *   get:
 *     tags: [Admin - Price Policies]
 *     summary: List all building price policies in read-only mode
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *       - { in: query, name: vehicleType, schema: { type: string, format: objectId } }
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Price policies returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/PricePolicy' } } } } } } ] } } } }
 * /api/admin/subscription-packages:
 *   get:
 *     tags: [Admin - Subscription Packages]
 *     summary: List manager subscription packages
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: isActive, schema: { type: boolean } }
 *     responses:
 *       200: { description: Subscription packages returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { type: object } } } } } } ] } } } }
 *   post:
 *     tags: [Admin - Subscription Packages]
 *     summary: Create a manager subscription package
 *     security: [{ bearerAuth: [] }]
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, price, durationDays], properties: { name: { type: string, example: Standard Plan }, price: { type: number, example: 500000 }, durationDays: { type: integer, example: 30 }, description: { type: string, example: Standard manager subscription }, features: { type: array, items: { type: string } }, isActive: { type: boolean, example: true } } } } } }
 *     responses:
 *       201: { description: Subscription package created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object } } } ] } } } }
 * /api/admin/subscription-packages/{id}:
 *   get:
 *     tags: [Admin - Subscription Packages]
 *     summary: Get manager subscription package details
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription package returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object } } } ] } } } }
 *   put:
 *     tags: [Admin - Subscription Packages]
 *     summary: Update a manager subscription package
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string }, price: { type: number }, durationDays: { type: integer }, description: { type: string }, features: { type: array, items: { type: string } }, isActive: { type: boolean } } } } } }
 *     responses:
 *       200: { description: Subscription package updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object } } } ] } } } }
 *   delete:
 *     tags: [Admin - Subscription Packages]
 *     summary: Delete a manager subscription package
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription package deleted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Package deleted } } } ] } } } }
 * /api/payments/webhook:
 *   post:
 *     tags: [Payment - Webhook]
 *     summary: Receive PayOS payment webhook
 *     description: Public webhook endpoint called by PayOS after payment status changes.
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, additionalProperties: true } } } }
 *     responses:
 *       200: { description: Webhook processed successfully., content: { application/json: { schema: { type: object, properties: { success: { type: boolean, example: true } } } } } }
 *       400: { content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
/**
 * @swagger
 * /api/admin/buildings/{buildingId}/revoke-manager:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Revoke a manager from a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [userId], properties: { userId: { type: string, format: objectId } } } } } }
 *     responses:
 *       200: { description: Manager revoked successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Manager revoked from building }, data: { type: object, properties: { assignment: { type: object } } } } } ] } } } }
 * /api/admin/buildings/{buildingId}/revoke-staff:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Revoke staff from a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [userId], properties: { userId: { type: string, format: objectId } } } } } }
 *     responses:
 *       200: { description: Staff revoked successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Staff revoked from building }, data: { type: object, properties: { assignment: { type: object } } } } } ] } } } }
 * /api/admin/buildings/{id}/subscription/grant:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Grant a building subscription without wallet charge
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [packageId], properties: { packageId: { type: string, format: objectId } } } } } }
 *     responses:
 *       200: { description: Subscription granted successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Subscription granted successfully }, data: { type: object, properties: { subscription: { type: object } } } } } ] } } } }
 * /api/admin/buildings/{id}/subscription/revoke:
 *   post:
 *     tags: [Admin - Buildings]
 *     summary: Revoke a building subscription immediately
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Subscription revoked successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Subscription revoked. }, data: { type: object, properties: { subscription: { type: object } } } } } ] } } } }
 * /api/admin/buildings/{id}/price-policies:
 *   get:
 *     tags: [Admin - Buildings]
 *     summary: List price policies for one building in read-only mode
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Building price policies returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/PricePolicy' } } } } } } ] } } } }
 * /api/admin/buildings/{id}/packages:
 *   get:
 *     tags: [Admin - Buildings]
 *     summary: List long-term parking packages for one building in read-only mode
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Building packages returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/LongTermPackage' } } } } } } ] } } } }
 */

