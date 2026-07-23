/**
 * @swagger
 * /api/manager/buildings/{buildingId}/incidents:
 *   get:
 *     tags: [Manager - Incidents]
 *     summary: List incidents for a building
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: status, schema: { type: string, enum: [open, investigating, escalated, penalty_pending, resolved, closed] } }
 *       - { in: query, name: severity, schema: { type: string, enum: [medium, high, critical] } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *     responses:
 *       200: { description: Incidents returned successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { items: { type: array, items: { $ref: '#/components/schemas/Incident' } }, pagination: { $ref: '#/components/schemas/PaginationMeta' } } } } } ] } } } }
 * /api/manager/buildings/{buildingId}/incidents/{id}:
 *   patch:
 *     tags: [Manager - Incidents]
 *     summary: Resolve an incident, optionally approving a penalty fee for the violator
 *     description: >
 *       Only a manager/admin may pass `action: 'penalize_violator'`. This only APPROVES the
 *       fee amount (defaults to the building's `ReservationPolicy.ruleViolationFee` when
 *       omitted) — it does NOT charge anything or force a check-out. The incident moves to
 *       `penalty_pending`. The fee is actually collected later, automatically, when a staff
 *       member checks out the violator's vehicle through the normal
 *       `POST /staff/parking-sessions/{id}/check-out` flow (matched by plate number in this
 *       building) — the payment method is whatever staff/customer choose at that check-out,
 *       not chosen here. Cash stays `pending` until confirmed via
 *       `POST .../wallet/pending-cash/{paymentId}/confirm`; other methods settle immediately
 *       and credit the building wallet right away. `action: 'penalize_violator'` is rejected
 *       with 409 `INCIDENT_ALREADY_RESOLVED` when the incident is already `resolved`/`closed` —
 *       report a new incident for a further violation instead of re-approving an old one
 *       (prevents double-charging the violator's plate).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: path, name: id, required: true, schema: { type: string, format: objectId } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [open, investigating, escalated, resolved, closed], description: 'penalty_pending is not settable directly (400 INVALID_STATUS) — use action=penalize_violator instead. Status also cannot be changed while an incident is already penalty_pending (409 PENALTY_PENDING_LOCKED).' }
 *               resolutionNote: { type: string }
 *               violatorPlate: { type: string, example: 59G2-038.80 }
 *               action: { type: string, enum: [penalize_violator] }
 *               penaltyFee: { type: number, description: Defaults to the building's ruleViolationFee policy when omitted., example: 100000 }
 *     responses:
 *       200: { description: Incident updated successfully., content: { application/json: { schema: { allOf: [ { $ref: '#/components/schemas/ApiResponseWrapper' }, { type: object, properties: { data: { type: object, properties: { item: { $ref: '#/components/schemas/Incident' } } } } } ] } } } }
 *       409: { description: PENALTY_PENDING_LOCKED — incident already has an approved pending penalty; status cannot be changed manually. INCIDENT_ALREADY_RESOLVED — cannot approve a penalty on an already resolved/closed incident. }
 */
