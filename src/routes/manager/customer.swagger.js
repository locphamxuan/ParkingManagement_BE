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
 *                               isActive: { type: boolean, example: true, description: Account active/locked status. }
 *                               walletBalance: { type: number, example: 250000 }
 *                               createdAt: { type: string, format: date-time, description: Account registration date. }
 *                               vehicles:
 *                                 type: array
 *                                 description: Vehicles registered by this customer (Vehicle collection).
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     plateNumber: { type: string, example: 59G2-038.80 }
 *                                     category: { type: string, enum: [motorcycle, ebike, emotorbike, car, suv, truck, other], example: car }
 *                                     categoryLabel: { type: string, example: Ô tô }
 *                                     brand: { type: string, nullable: true, example: Toyota }
 *                               sessionCount: { type: integer, example: 5, description: Number of parking sessions in THIS building. }
 *                               lastVisitAt: { type: string, format: date-time, nullable: true, description: Most recent entryTime in this building; null if never parked here (subscription-only). }
 *                               hasActivePackage: { type: boolean, example: true }
 *                               hasAnyPackage: { type: boolean, example: true }
 *                               subscriptions:
 *                                 type: array
 *                                 description: Every long-term subscription this user has in this building, newest first.
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     _id: { type: string, format: objectId }
 *                                     plateNumber: { type: string, example: 59G2-038.80 }
 *                                     startDate: { type: string, format: date-time }
 *                                     endDate: { type: string, format: date-time }
 *                                     status: { type: string, enum: [pending, active, expired, cancelled] }
 *                                     package: { type: object, nullable: true, properties: { _id: { type: string }, name: { type: string }, price: { type: number } } }
 *                                     refundPercent: { type: number, nullable: true }
 *                                     refundAmount: { type: number, nullable: true }
 *                         pagination:
 *                           $ref: '#/components/schemas/PaginationMeta'
 */
