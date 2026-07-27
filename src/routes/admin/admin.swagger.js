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
 * /api/admin/users/{id}/status:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Activate or deactivate a user account
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [isActive], properties: { isActive: { type: boolean, example: false } } } } } }
 *     responses:
 *       200: { description: User status updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: User status updated }, data: { type: object, properties: { user: { $ref: '#/components/schemas/PublicUser' } } } } } ] } } } }
 *       409: { description: USER_HAS_ACTIVE_SESSION / USER_HAS_ACTIVE_SUBSCRIPTION — cannot deactivate a user with an active parking session or subscription., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
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

