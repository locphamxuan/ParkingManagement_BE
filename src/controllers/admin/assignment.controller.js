const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const buildingManagerService = require("../../services/buildingManager.service");
const AppError = require("../../utils/AppError");

const assignManager = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const { buildingId } = req.params;

  if (!userId) throw new AppError("userId is required", 400);

  const assignment = await buildingManagerService.assignManagerToBuilding({
    buildingId,
    userId,
  });

  sendSuccess(res, {
    statusCode: 201,
    message: "Manager assigned to building",
    data: { assignment },
  });
});

const revokeManager = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const { buildingId } = req.params;

  if (!userId) throw new AppError("userId is required", 400);

  const assignment = await buildingManagerService.revokeManagerFromBuilding({
    buildingId,
    userId,
  });

  sendSuccess(res, {
    message: "Manager revoked from building",
    data: { assignment },
  });
});

module.exports = { assignManager, revokeManager };
