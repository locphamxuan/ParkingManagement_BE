const parameterDescriptions = Object.freeze({
  action: 'Audit action to include in the result.',
  building: 'Parking building ID used to scope the request.',
  buildingId: 'Parking building ID used to scope the request.',
  code: 'QR or domain code supplied by the client.',
  date: 'Calendar date in YYYY-MM-DD format. Defaults to the current local date when omitted.',
  floor: 'Parking floor ID used to narrow the result.',
  floorId: 'Parking floor ID used to scope the request.',
  from: 'Inclusive start of the reporting period in ISO 8601 date or date-time format.',
  id: 'ID of the resource identified by this endpoint.',
  includeInactive: 'Set to true to include inactive configuration records.',
  isActive: 'Filter records by whether they are active.',
  limit: 'Maximum number of records returned per page.',
  method: 'Filter payments by payment method.',
  orderCode: 'PayOS order code that identifies the payment.',
  page: 'One-based page number. Defaults to 1.',
  paymentId: 'Payment ID to confirm or retrieve.',
  plate: 'Vehicle license plate number used to find parking sessions.',
  plateId: 'ID of the registered license plate.',
  qrCode: 'QR code value that identifies a user or vehicle.',
  rating: 'Filter feedback by its numeric rating.',
  reason: 'Filter transactions by their recorded reason.',
  resource: 'Audit resource type to include in the result.',
  search: 'Free-text search term applied by the endpoint.',
  severity: 'Filter incidents by severity.',
  staff: 'Staff user ID used to narrow the result.',
  staleHours: 'Age threshold in hours for flagging pending electronic payments. Defaults to 24.',
  status: 'Filter records by their current status.',
  to: 'Inclusive end of the reporting period in ISO 8601 date or date-time format.',
  type: 'Filter records by their domain-specific type.',
  usageType: 'Parking usage category used to filter or rank slots.',
  userId: 'User ID used to scope the result.',
  vehicleType: 'Vehicle type ID used to filter or rank the result.',
  vehicleTypeId: 'Vehicle type ID used to scope the result.',
  workDate: 'Staff shift work date in YYYY-MM-DD format.',
});

const objectIdParameter = (name, description) => ({
  in: 'path',
  name,
  required: true,
  description,
  schema: { type: 'string', format: 'objectId' },
});

const response = (description, schema = { $ref: '#/components/schemas/ApiResponseWrapper' }) => ({
  description,
  content: { 'application/json': { schema } },
});

const swaggerPathAdditions = {
  '/': {
    get: {
      tags: ['System'],
      summary: 'Get the API entry point',
      description: 'Returns the service banner and the prefix every business endpoint is mounted under.',
      responses: { 200: response('Service banner returned successfully.') },
    },
  },
  '/api-docs.json': {
    get: {
      tags: ['System'],
      summary: 'Download the OpenAPI specification',
      description: 'Returns this OpenAPI document as JSON, for client generators and contract tests.',
      responses: { 200: response('OpenAPI specification returned successfully.') },
    },
  },
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Get service health',
      description: 'Reports whether the API process is running and whether its database connection is available.',
      responses: {
        200: response('The API and database are available.'),
        503: response('The API is running but the database is unavailable.'),
      },
    },
  },
  '/api/admin/governance/roles': {
    get: {
      tags: ['Admin - Governance'],
      summary: 'Get the system role catalog',
      description: 'Returns the roles and permissions available for administrative user management.',
      security: [{ bearerAuth: [] }],
      responses: { 200: response('Role catalog returned successfully.') },
    },
  },
  '/api/admin/revenue/transactions': {
    get: {
      tags: ['Admin - Revenue'],
      summary: 'List system payment transactions',
      description: 'Returns paginated platform payments. Filters are combined to narrow the financial audit result.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 200, default: 30 } },
        { in: 'query', name: 'buildingId', schema: { type: 'string', format: 'objectId' } },
        { in: 'query', name: 'type', schema: { type: 'string', enum: ['session', 'reservation', 'subscription', 'penalty', 'refund', 'topup', 'cancellation_fee'] } },
        { in: 'query', name: 'method', schema: { type: 'string', enum: ['cash', 'wallet', 'qr', 'card', 'payos'] } },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['pending', 'success', 'failed', 'refunded', 'reconciliation_required'] } },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: { 200: response('Payment transactions returned successfully.') },
    },
  },
  '/api/admin/revenue/reconciliation': {
    get: {
      tags: ['Admin - Revenue'],
      summary: 'Get system revenue reconciliation data',
      description: 'Returns pending cash, stale electronic payments, reconciliation flags, and building-wallet integrity checks.',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'staleHours', schema: { type: 'integer', minimum: 1, maximum: 720, default: 24 } }],
      responses: { 200: response('Reconciliation data returned successfully.') },
    },
  },
  '/api/manager/buildings/{buildingId}/sessions/history': {
    get: {
      tags: ['Manager - Dashboard'],
      summary: 'List parking session history for a building',
      description: 'Returns paginated parking sessions for the selected building, optionally filtered by status, plate, and creation time.',
      security: [{ bearerAuth: [] }],
      parameters: [
        objectIdParameter('buildingId', parameterDescriptions.buildingId),
        { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['active', 'completed', 'cancelled'] } },
        { in: 'query', name: 'plate', schema: { type: 'string', example: '59G2-038.80' } },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: { 200: response('Parking session history returned successfully.') },
    },
  },
  '/api/manager/buildings/{buildingId}/wallet/penalty-revenue': {
    get: {
      tags: ['Manager - Wallet'],
      summary: 'Get penalty revenue for a building',
      description: 'Returns revenue from incident penalties for the selected building.',
      security: [{ bearerAuth: [] }],
      parameters: [objectIdParameter('buildingId', parameterDescriptions.buildingId)],
      responses: { 200: response('Penalty revenue returned successfully.') },
    },
  },
  '/api/staff/parking-sessions/my-checkouts': {
    get: {
      tags: ['Staff - Parking Sessions'],
      summary: 'List today’s completed check-outs',
      description: 'Returns today’s completed parking sessions in the authenticated staff member’s permitted building scope.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'building', schema: { type: 'string', format: 'objectId' } },
        { in: 'query', name: 'buildingId', schema: { type: 'string', format: 'objectId' } },
      ],
      responses: { 200: response('Check-outs returned successfully.') },
    },
  },
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const updateParameterDescriptions = (parameters = []) => parameters.map((parameter) => ({
  ...parameter,
  description: parameter.description || parameterDescriptions[parameter.name]
    || `Value for the ${parameter.name} parameter used by this endpoint.`,
}));

const enrichOperation = (operation) => {
  const enriched = {
    ...operation,
    description: operation.description
      || `${operation.summary}. Use the documented request fields and parameters to scope this operation.`,
  };

  if (operation.parameters) enriched.parameters = updateParameterDescriptions(operation.parameters);
  if (operation.requestBody && !operation.requestBody.description) {
    enriched.requestBody = {
      ...operation.requestBody,
      description: `Request payload for: ${operation.summary}.`,
    };
  }

  return enriched;
};

const enrichPathItem = (pathItem) => {
  const enriched = { ...pathItem };
  if (pathItem.parameters) enriched.parameters = updateParameterDescriptions(pathItem.parameters);
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
    if (pathItem[method]) enriched[method] = enrichOperation(pathItem[method]);
  }
  return enriched;
};

const normalizeSwaggerSpec = (rawSpec) => {
  const paths = {};
  for (const [rawPath, pathItem] of Object.entries(rawSpec.paths || {})) {
    const path = rawPath;
    const existing = paths[path] || {};
    paths[path] = enrichPathItem({ ...existing, ...pathItem });
  }

  for (const [path, pathItem] of Object.entries(swaggerPathAdditions)) {
    paths[path] = enrichPathItem({
      ...(paths[path] || {}),
      ...clone(pathItem),
    });
  }

  return { ...rawSpec, paths };
};

module.exports = { normalizeSwaggerSpec, swaggerPathAdditions };
