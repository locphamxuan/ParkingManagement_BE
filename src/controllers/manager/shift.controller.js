const asyncHandler = require("../../utils/asyncHandler");
const { sendSuccess } = require("../../utils/response");
const service = require("../../services/manager/shift.service");

const listShifts = asyncHandler(async (req, res) => {
  const items = await service.listShifts(req.user, req.params.buildingId);
  sendSuccess(res, { data: { items } });
});

const createShift = asyncHandler(async (req, res) => {
  const item = await service.createShift(
    req.user,
    req.params.buildingId,
    req.body
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Shift created",
    data: { item },
  });
});

const updateShift = asyncHandler(async (req, res) => {
  const item = await service.updateShift(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Shift updated", data: { item } });
});

const removeShift = asyncHandler(async (req, res) => {
  await service.removeShift(req.user, req.params.buildingId, req.params.id);
  sendSuccess(res, { message: "Shift removed", data: null });
});

const listStaffShifts = asyncHandler(async (req, res) => {
  const items = await service.listStaffShifts(
    req.user,
    req.params.buildingId,
    req.query
  );
  sendSuccess(res, { data: { items } });
});

const assignStaffShift = asyncHandler(async (req, res) => {
  const item = await service.assignStaffShift(
    req.user,
    req.params.buildingId,
    req.body
  );
  sendSuccess(res, {
    statusCode: 201,
    message: "Staff shift assigned",
    data: { item },
  });
});

const updateStaffShift = asyncHandler(async (req, res) => {
  const item = await service.updateStaffShift(
    req.user,
    req.params.buildingId,
    req.params.id,
    req.body
  );
  sendSuccess(res, { message: "Staff shift updated", data: { item } });
});

const removeStaffShift = asyncHandler(async (req, res) => {
  await service.removeStaffShift(
    req.user,
    req.params.buildingId,
    req.params.id
  );
  sendSuccess(res, { message: "Staff shift removed", data: null });
});

const listAvailableStaff = asyncHandler(async (req, res) => {
  const items = await service.listAvailableStaff(
    req.user,
    req.params.buildingId
  );
  sendSuccess(res, { data: { items } });
});

module.exports = {
  listShifts,
  createShift,
  updateShift,
  removeShift,
  listStaffShifts,
  assignStaffShift,
  updateStaffShift,
  removeStaffShift,
  listAvailableStaff,
};
