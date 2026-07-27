const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/admin/governance.service');

const getRoleCatalog = asyncHandler(async (_req, res) => {
  sendSuccess(res, { data: service.getRoleCatalog() });
});

module.exports = { getRoleCatalog };
