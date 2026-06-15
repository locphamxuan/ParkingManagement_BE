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
  if (req.method === "POST") requireFields(req.body, ["name"]);
  if (req.body.code !== undefined && !isNonEmptyString(req.body.code))
    throw new AppError("code must not be empty", 400);
  if (req.body.name !== undefined && !isNonEmptyString(req.body.name))
    throw new AppError("name is required", 400);
});

const validateFloor = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["code", "capacity"]);
  if (req.body.capacity !== undefined && Number(req.body.capacity) < 0)
    throw new AppError("capacity must be >= 0", 400);
});

const validateGate = wrap((req) => {
  if (req.method === "POST") requireFields(req.body, ["code"]);
  // direction: only in | out (both still accepted for backward-compat)
  if (
    req.body.direction !== undefined &&
    !["in", "out", "both"].includes(req.body.direction)
  ) {
    throw new AppError("direction must be in|out", 400);
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

const isHHMM = (v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const validatePricePolicy = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["name", "vehicleType", "hourlyRate"]);
  if (req.body.hourlyRate !== undefined && Number(req.body.hourlyRate) < 0)
    throw new AppError("hourlyRate must be >= 0", 400);
  if (req.body.type !== undefined && !["regular", "peak"].includes(req.body.type))
    throw new AppError("type must be 'regular' or 'peak'", 400);

  // Giá theo KHUNG GIỜ (peak): bắt buộc có timeWindow hợp lệ để áp đúng khung.
  if (req.body.type === "peak") {
    const w = req.body.timeWindow || {};
    if (!isHHMM(w.from) || !isHHMM(w.to))
      throw new AppError("Khung giờ (timeWindow.from/to) phải có định dạng HH:MM", 400);
    if (w.from === w.to)
      throw new AppError("Khung giờ bắt đầu và kết thúc không được trùng nhau", 400);
  }

  // effectiveFrom/effectiveTo nếu có cả hai thì from < to.
  if (req.body.effectiveFrom && req.body.effectiveTo) {
    if (new Date(req.body.effectiveFrom) >= new Date(req.body.effectiveTo))
      throw new AppError("effectiveFrom phải trước effectiveTo", 400);
  }
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
  if (req.body.maxHoursPerDay !== undefined && Number(req.body.maxHoursPerDay) < 0)
    throw new AppError("maxHoursPerDay must be >= 0", 400);
});

const validateReservationPolicy = wrap((req) => {
  if (
    req.body.refundPercent !== undefined &&
    (req.body.refundPercent < 0 || req.body.refundPercent > 100)
  )
    throw new AppError("refundPercent must be 0..100", 400);
  if (
    req.body.depositPercent !== undefined &&
    (req.body.depositPercent < 0 || req.body.depositPercent > 100)
  )
    throw new AppError("depositPercent must be 0..100", 400);
  if (req.body.maxHoldMinutes !== undefined && Number(req.body.maxHoldMinutes) < 0)
    throw new AppError("maxHoldMinutes must be >= 0", 400);
  if (req.body.maxAdvanceDays !== undefined && Number(req.body.maxAdvanceDays) < 1)
    throw new AppError("maxAdvanceDays must be >= 1", 400);
  if (req.body.maxDurationHours !== undefined && Number(req.body.maxDurationHours) < 1)
    throw new AppError("maxDurationHours must be >= 1", 400);
  if (req.body.overstayPenaltyPercent !== undefined && Number(req.body.overstayPenaltyPercent) < 0)
    throw new AppError("overstayPenaltyPercent must be >= 0", 400);
});

const validateShift = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["name", "code", "startTime", "endTime"]);
});

const validateStaffShift = wrap((req) => {
  if (req.method === "POST")
    requireFields(req.body, ["shift", "staff", "workDate"]);
});

const { FEEDBACK_STATUS } = require("../models/operations/Feedback");

const validateFeedbackResponse = wrap((req) => {
  if (req.body.response !== undefined && !isNonEmptyString(req.body.response))
    throw new AppError("response cannot be empty", 400);
  if (req.body.response !== undefined && req.body.response.trim().length > 1000)
    throw new AppError("response cannot exceed 1000 characters", 400);
  if (req.body.staffReply !== undefined && !isNonEmptyString(req.body.staffReply))
    throw new AppError("staffReply cannot be empty", 400);
  if (req.body.staffReply !== undefined && req.body.staffReply.trim().length > 1000)
    throw new AppError("staffReply cannot exceed 1000 characters", 400);
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
