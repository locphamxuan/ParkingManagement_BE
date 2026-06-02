const AppError = require("../utils/AppError");

const STATUS_LIST = ["active", "inactive", "maintenance"];

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;
const isObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

const validateBuildingCreate = (req, _res, next) => {
  const { name, code, totalFloors, pricing, operatingHours } = req.body;

  if (!isNonEmptyString(name)) {
    return next(new AppError("Building name is required", 400));
  }
  if (!isNonEmptyString(code)) {
    return next(new AppError("Building code is required", 400));
  }
  if (!Number.isInteger(Number(totalFloors)) || Number(totalFloors) < 1) {
    return next(new AppError("totalFloors must be at least 1", 400));
  }
  if (!isObject(pricing) || pricing.hourlyRate === undefined) {
    return next(new AppError("pricing.hourlyRate is required", 400));
  }
  if (
    !isObject(operatingHours) ||
    !isNonEmptyString(operatingHours.open) ||
    !isNonEmptyString(operatingHours.close)
  ) {
    return next(
      new AppError(
        "operatingHours.open and operatingHours.close are required",
        400,
      ),
    );
  }

  req.body.name = name.trim();
  req.body.code = code.trim().toUpperCase();
  req.body.totalFloors = Number(totalFloors);
  next();
};

const validateBuildingUpdate = (req, _res, next) => {
  const { name, code, totalFloors, pricing, operatingHours, status } = req.body;

  if (name !== undefined && !isNonEmptyString(name)) {
    return next(new AppError("Building name must not be empty", 400));
  }
  if (code !== undefined && !isNonEmptyString(code)) {
    return next(new AppError("Building code must not be empty", 400));
  }
  if (
    totalFloors !== undefined &&
    (!Number.isInteger(Number(totalFloors)) || Number(totalFloors) < 1)
  ) {
    return next(new AppError("totalFloors must be at least 1", 400));
  }
  if (pricing !== undefined && !isObject(pricing)) {
    return next(new AppError("pricing must be an object", 400));
  }
  if (operatingHours !== undefined && !isObject(operatingHours)) {
    return next(new AppError("operatingHours must be an object", 400));
  }
  if (status !== undefined && !STATUS_LIST.includes(status)) {
    return next(
      new AppError(`status must be one of: ${STATUS_LIST.join(", ")}`, 400),
    );
  }

  if (typeof name === "string") req.body.name = name.trim();
  if (typeof code === "string") req.body.code = code.trim().toUpperCase();
  if (totalFloors !== undefined) req.body.totalFloors = Number(totalFloors);
  next();
};

const validateBuildingStatus = (req, _res, next) => {
  const { status } = req.body;

  if (!STATUS_LIST.includes(status)) {
    return next(
      new AppError(`status must be one of: ${STATUS_LIST.join(", ")}`, 400),
    );
  }

  next();
};

const validateManagerBuildingUpdate = (req, _res, next) => {
  const { name, code, totalFloors, pricing, operatingHours, status } = req.body;

  if (
    name === undefined &&
    code === undefined &&
    totalFloors === undefined &&
    pricing === undefined &&
    operatingHours === undefined &&
    status === undefined
  ) {
    return next(new AppError("At least one field is required", 400));
  }

  return validateBuildingUpdate(req, _res, next);
};

module.exports = {
  validateBuildingCreate,
  validateBuildingUpdate,
  validateBuildingStatus,
  validateManagerBuildingUpdate,
};
