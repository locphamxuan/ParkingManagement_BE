const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/package.service");

const listPackages = asyncHandler(async (req, res) => {
  const items = await service.listPackages(
    req.user,
    req.params.buildingId,
    req.query
  );
  sendSuccess(res, { data: { items } });
});

const createPackage = asyncHandler(async (req, res) => {
  const item = await service.createPackage(
    req.user,
    req.params.buildingId,
    req.body
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Package created",
    data: { item },
  });
});

const updatePackage = asyncHandler(async (req, res) => {
  const item = await service.updatePackage(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Package updated", data: { item } });
});

const removePackage = asyncHandler(async (req, res) => {
  await service.removePackage(req.user, req.params.buildingId, req.params.id);
  sendSuccess(res, { message: "Package removed", data: null });
});

const listSubscriptions = asyncHandler(async (req, res) => {
  const data = await service.listSubscriptions(
    req.user,
    req.params.buildingId,
    req.query
  );
  sendSuccess(res, { data });
});

module.exports = {
  listPackages,
  createPackage,
  updatePackage,
  removePackage,
  listSubscriptions,
};
