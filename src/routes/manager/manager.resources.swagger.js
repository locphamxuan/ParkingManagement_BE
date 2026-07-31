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
 *               code: { type: string, example: CAR, description: Bỏ trống → tự sinh từ name. }
 *               name: { type: string, example: Car }
 *               category:
 *                 type: string
 *                 enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
 *                 default: car
 *                 description: >
 *                   Thể loại xe chuẩn mà danh mục này đại diện. Đặt đúng giá trị này là
 *                   điều kiện để xe của khách được khớp vào đúng bảng giá và ô đỗ của tòa.
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
 *               category:
 *                 type: string
 *                 enum: [motorcycle, ebike, emotorbike, car, suv, truck, other]
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
 *     summary: Create a floor (code is auto-generated from name, e.g. "Floor 1" → F1)
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
 *             required: [name, capacity]
 *             properties:
 *               name: { type: string, example: 'Floor 1' }
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
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: 'Floor 1' }, capacity: { type: integer, example: 120 }, allowedVehicleTypes: { type: array, items: { type: string, format: objectId } }, status: { type: string, enum: [active, inactive, maintenance], example: active } } } } } }
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
 *     summary: Create a parking slot (code auto-generated from the zone code when omitted)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [floor, zone], properties: { floor: { type: string, format: objectId }, zone: { type: string, format: objectId }, code: { type: string, example: A-01, description: 'Optional — auto-generated as {zoneCode}-01, -02… when omitted.' }, status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }, reservable: { type: boolean, example: true }, note: { type: string, example: Near elevator } } } } } }
 *     responses:
 *       201: { description: Slot created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Slot created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/ParkingSlot' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/slots/batch:
 *   post:
 *     tags: [Manager - Slots]
 *     summary: Create parking slots in batch — codes auto-generated sequentially from the zone code
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [floor, zone, quantity], properties: { floor: { type: string, format: objectId }, zone: { type: string, format: objectId }, quantity: { type: integer, minimum: 1, maximum: 50, example: 10 }, status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }, reservable: { type: boolean, example: true }, note: { type: string, example: Row A } } } } } }
 *     responses:
 *       201: { description: Slots created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: 10 slot(s) created }, data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/ParkingSlot' } } } } } } ] } } } }
 *       409: { description: Floor/zone capacity exceeded., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/slots/{id}:
 *   put:
 *     tags: [Manager - Slots]
 *     summary: Update a parking slot (code is not updatable)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { status: { type: string, enum: [available, occupied, reserved, maintenance], example: available }, reservable: { type: boolean, example: true }, note: { type: string, example: Updated note } } } } } }
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
 * /api/manager/buildings/{buildingId}/zones:
 *   get:
 *     tags: [Manager - Zones]
 *     summary: List zones (each item includes server-computed slotCount)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: floor, schema: { type: string, format: objectId } }
 *       - { in: query, name: usageType, schema: { type: string, enum: [walk_in, registered, subscriber, reserved] } }
 *       - { in: query, name: status, schema: { type: string, enum: [active, inactive, maintenance] } }
 *     responses:
 *       200: { description: Zones returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Zone' } } } } } } ] } } } }
 *   post:
 *     tags: [Manager - Zones]
 *     summary: Create a zone (code is auto-generated from name, unique per floor)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, required: [name, floor, vehicleType, usageType, capacity], properties: { name: { type: string, example: 'Walk-in zone' }, floor: { type: string, format: objectId }, vehicleType: { type: string, format: objectId }, usageType: { type: string, enum: [walk_in, registered, subscriber, reserved], example: walk_in }, capacity: { type: integer, minimum: 1, example: 20 }, status: { type: string, enum: [active, inactive, maintenance], example: active } } } } } }
 *     responses:
 *       201: { description: Zone created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Zone created }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Zone' } } } } } ] } } } }
 *       409: { description: Zone capacity exceeds the floor capacity budget., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 * /api/manager/buildings/{buildingId}/zones/{id}:
 *   put:
 *     tags: [Manager - Zones]
 *     summary: Update a zone (code is not updatable)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody: { required: true, content: { application/json: { schema: { type: object, properties: { name: { type: string, example: 'VIP zone A' }, usageType: { type: string, enum: [walk_in, registered, subscriber, reserved] }, capacity: { type: integer, minimum: 1, example: 25 }, status: { type: string, enum: [active, inactive, maintenance] } } } } } }
 *     responses:
 *       200: { description: Zone updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Zone updated }, data: { type: object, properties: { item: { $ref: '#/components/schemas/Zone' } } } } } ] } } } }
 *   delete:
 *     tags: [Manager - Zones]
 *     summary: Remove a zone (must contain no slots)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     responses:
 *       200: { description: Zone removed successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { message: { type: string, example: Zone removed }, data: { nullable: true, example: null } } } ] } } } }
 *       409: { description: Zone still has slots., content: { application/json: { schema: { $ref: '#/components/schemas/ErrorResponse' } } } }
 */
