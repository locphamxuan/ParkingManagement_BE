const AppError = require("../utils/AppError");

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const requireFields = (body, fields) => {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ""
  );
  if (missing.length) {
    throw new AppError(`Missing fields: ${missing.join(", ")}`, 400);
  }
};

const wrap = (fn) => (req, _res, next) => {
  try {
    fn(req);
    next();
  } catch (err) {
    next(err);
  }
};

const validateVehicleType = wrap((req) => {
  if (req.method === "POST") requireFields(req.body, ["code", "name"]);
  if (req.body.code !== undefined && !isNonEmptyString(req.body.code))
    throw new AppError("code is required", 400);
  if (req.body.name !== undefined && !isNonEmptyString(req.body.name))
    throw new AppError("name is required", 400);
});

const validateFloor = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["code", "name", "levelNumber", "capacity"]);
  if (req.body.capacity !== undefined && Number(req.body.capacity) < 0)
    throw new AppError("capacity must be >= 0", 400);
});

const validateGate = wrap((req) => {
  if (req.method === "POST") requireFields(req.body, ["code", "name"]);
  if (
    req.body.direction !== undefined &&
    !["in", "out", "both"].includes(req.body.direction)
  ) {
    throw new AppError("direction must be in|out|both", 400);
  }
});

const SLOT_STATUS = ["available", "occupied", "reserved", "maintenance"];

const validateSlot = wrap((req) => {
  if (req.method === "POST") requireFields(req.body, ["code", "floor"]);
  if (req.body.status !== undefined && !SLOT_STATUS.includes(req.body.status)) {
    throw new AppError(`status must be one of: ${SLOT_STATUS.join(", ")}`, 400);
  }
});

const validateSlotStatus = wrap((req) => {
  if (!SLOT_STATUS.includes(req.body.status)) {
    throw new AppError(`status must be one of: ${SLOT_STATUS.join(", ")}`, 400);
  }
});

const validatePricePolicy = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["name", "vehicleType", "hourlyRate"]);
  if (req.body.hourlyRate !== undefined && Number(req.body.hourlyRate) < 0)
    throw new AppError("hourlyRate must be >= 0", 400);
});

const validatePackage = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, [
      "name",
      "code",
      "vehicleType",
      "durationDays",
      "price",
    ]);
  if (req.body.durationDays !== undefined && Number(req.body.durationDays) < 1)
    throw new AppError("durationDays must be >= 1", 400);
  if (req.body.price !== undefined && Number(req.body.price) < 0)
    throw new AppError("price must be >= 0", 400);
});

const validateReservationPolicy = wrap((req) => {
  if (
    req.body.refundPercent !== undefined &&
    (req.body.refundPercent < 0 || req.body.refundPercent > 100)
  )
    throw new AppError("refundPercent must be 0..100", 400);
  if (
    req.body.reservableRatio !== undefined &&
    (req.body.reservableRatio < 0 || req.body.reservableRatio > 1)
  )
    throw new AppError("reservableRatio must be 0..1", 400);
});

const validateShift = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["name", "code", "startTime", "endTime"]);
});

const validateStaffShift = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["shift", "staff", "workDate"]);
});

const FEEDBACK_STATUS = ["open", "in_progress", "resolved", "closed"];

const validateFeedbackResponse = wrap((req) => {
  if (req.body.response !== undefined && !isNonEmptyString(req.body.response))
    throw new AppError("response cannot be empty", 400);
  if (
    req.body.status !== undefined &&
    !FEEDBACK_STATUS.includes(req.body.status)
  )
    throw new AppError(
      `status must be one of: ${FEEDBACK_STATUS.join(", ")}`,
      400
    );
});

module.exports = {
  validateVehicleType,
  validateFloor,
  validateGate,
  validateSlot,
  validateSlotStatus,
  validatePricePolicy,
  validatePackage,
  validateReservationPolicy,
  validateShift,
  validateStaffShift,
  validateFeedbackResponse,
};
