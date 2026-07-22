/**
 * @swagger
 * /api/staff/incidents:
 *   get:
 *     tags: [Staff - Incidents]
 *     summary: List incidents for the staff's assigned building(s)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: buildingId, schema: { type: string, format: objectId } }
 *       - { in: query, name: status, schema: { type: string, enum: [open, investigating, escalated, penalty_pending, resolved, closed] } }
 *       - { in: query, name: severity, schema: { type: string, enum: [medium, high, critical] } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: Incidents returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Incident' } }, meta: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 *   post:
 *     tags: [Staff - Incidents]
 *     summary: Report an incident on the spot (staff cannot attach a penalty fee here)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type: { type: string, example: vehicle_damaged }
 *               target: { type: string, example: 59G2-038.80 }
 *               note: { type: string }
 *               buildingId: { type: string, format: objectId }
 *               severity: { type: string, enum: [medium, high, critical] }
 *               parkingSessionId: { type: string, format: objectId, description: Optional reference to a related session (e.g. overstay, payment dispute). }
 *               status: { type: string, enum: [open, resolved], description: Defaults to open. 'escalated'/'penalty_pending' cannot be set at creation — they are only set automatically (user report auto-escalation) or via manager penalty approval. }
 *     responses:
 *       201: { description: Incident created successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/Incident' } } } } } ] } } } }
 * /api/staff/incidents/{id}:
 *   patch:
 *     tags: [Staff - Incidents]
 *     summary: Update/resolve an incident (status change only — penalty fee is manager-only)
 *     description: >
 *       `action: 'penalize_violator'` and non-zero `penaltyFee`/`paymentMethod` are
 *       rejected with `403 MANAGER_ONLY_ACTION` for staff. Incidents auto-escalated
 *       (`status: escalated`, unregistered violator plate) reject ALL staff actions
 *       with `403 ESCALATED_MANAGER_ONLY` — staff can still view via GET.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [open, investigating, escalated, resolved, closed], description: 'penalty_pending is not settable directly (400 INVALID_STATUS) — only via action=penalize_violator. Status also cannot be changed while an incident is penalty_pending (409 PENALTY_PENDING_LOCKED) — it resolves automatically at checkout.' }
 *               resolutionNote: { type: string }
 *               violatorPlate: { type: string }
 *     responses:
 *       200: { description: Incident updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/Incident' } } } } } ] } } } }
 *       403: { description: MANAGER_ONLY_ACTION (penalty attempted by staff) or ESCALATED_MANAGER_ONLY (incident is manager-only)., $ref: '#/components/responses/ForbiddenError' }
 *       409: { description: PENALTY_PENDING_LOCKED — incident has an approved pending penalty; status cannot be changed manually. }
 */
