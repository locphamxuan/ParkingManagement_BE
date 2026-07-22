/**
 * @swagger
 * /api/manager/buildings/{buildingId}/customers:
 *   get:
 *     tags: [Manager - Customers]
 *     summary: List registered users (non-walk-in) who have used this building, with package-registration status
 *     description: >
 *       Returns distinct users (role 'user') who either have a ParkingSession with a linked
 *       account in this building or a LongTermSubscription in this building. Walk-in sessions
 *       (ParkingSession.user === null) are excluded.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: buildingId, required: true, schema: { type: string, format: objectId } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: hasPackage, schema: { type: string, enum: [true, false] }, description: Filter by whether the user has ever registered a package (any status) in this building. }
 *     responses:
 *       200:
 *         description: Customers returned successfully.
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
 *                           items:
 *                             type: object
 *                             properties:
 *                               _id: { type: string, format: objectId }
 *                               fullName: { type: string, example: Nguyen Van A }
 *                               email: { type: string, example: a@example.com }
 *                               phone: { type: string, nullable: true, example: '0901234567' }
 *                               hasActivePackage: { type: boolean, example: true }
 *                               hasAnyPackage: { type: boolean, example: true }
 *                         pagination:
 *                           $ref: '#/components/schemas/PaginationMeta'
 */
