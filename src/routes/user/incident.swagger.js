/**
 * @swagger
 * /api/users/incidents:
 *   post:
 *     tags: [User - Incidents]
 *     summary: Report an incident (violator plate check auto-runs when applicable)
 *     description: >
 *       `type` is either one of the fixed self-issue categories (vehicle_damaged,
 *       facility_issue, wrong_scan, payment_dispute, security, other) OR the `code`
 *       of one of the building's configured violation types (see
 *       GET /api/users/buildings/{buildingId}/violation-types) — e.g. `wrong_spot`,
 *       `slot_occupied`. When reporting a violation type and `violatorPlate` is given,
 *       the system checks whether the plate has a registered account (active
 *       subscription or a session linked to a user) in that building. If NOT found,
 *       the incident is auto-escalated (`status: escalated`) and can only be handled
 *       by a manager.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type: { type: string, description: "One of vehicle_damaged, facility_issue, wrong_scan, payment_dispute, security, other, or a building violation-type code (e.g. wrong_spot, slot_occupied).", example: slot_occupied }
 *               target: { type: string, example: 59G2-038.80 }
 *               note: { type: string, example: Someone parked in my reserved slot }
 *               buildingId: { type: string, format: objectId }
 *               slotId: { type: string, format: objectId }
 *               violatorPlate: { type: string, example: 59G2-038.80 }
 *     responses:
 *       201: { description: Incident reported successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/Incident' } } } } } ] } } } }
 *       400: { description: type is required / BUILDING_REQUIRED (could not infer a building)., $ref: '#/components/responses/ValidationError' }
 * /api/users/incidents/me:
 *   get:
 *     tags: [User - Incidents]
 *     summary: List incidents reported by the current user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [open, investigating, escalated, penalty_pending, resolved, closed] } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: Incidents returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Incident' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 */
