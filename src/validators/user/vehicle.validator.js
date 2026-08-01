const AppError = require('../../utils/AppError');
const { normalizePlate, isValidVietnamPlate } = require('../../utils/plate.util');
const { assertCategoryMatchesPlate } = require('../../utils/vehicleRules');
const {
  VEHICLE_CATEGORY_CODES,
  DEFAULT_VEHICLE_CATEGORY,
  isVehicleCategory,
} = require('../../constants/vehicle');

const MAX_LENGTHS = { brand: 50 };

/** '' / khoảng trắng → null (xoá giá trị), còn lại trả chuỗi đã trim. */
const cleanText = (value, field) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new AppError(`${field} phải là chuỗi`, 400);
  const trimmed = value.trim();
  if (trimmed.length > MAX_LENGTHS[field]) {
    throw new AppError(`${field} không được vượt quá ${MAX_LENGTHS[field]} ký tự`, 400);
  }
  return trimmed || null;
};

const assertCategory = (value) => {
  if (!isVehicleCategory(value)) {
    throw new AppError(`category phải là một trong: ${VEHICLE_CATEGORY_CODES.join(', ')}`, 400);
  }
  return `${value}`.toLowerCase();
};

/**
 * Chuẩn hoá mô tả xe dùng chung cho cả tạo mới lẫn cập nhật — một chỗ duy nhất
 * quyết định giới hạn độ dài và cách hiểu giá trị rỗng.
 */
const normalizeDescriptiveFields = (body) => {
  const cleaned = cleanText(body.brand, 'brand');
  if (cleaned !== undefined) body.brand = cleaned;
};

const wrap = (fn) => (req, _res, next) => {
  try {
    fn(req);
    next();
  } catch (err) {
    next(err);
  }
};

const validateCreateVehicle = wrap((req) => {
  const { plateNumber } = req.body;
  if (!`${plateNumber || ''}`.trim()) throw new AppError('plateNumber là bắt buộc', 400);

  const normalized = normalizePlate(plateNumber);
  if (!isValidVietnamPlate(normalized)) {
    throw new AppError(
      'Biển số không hợp lệ. Định dạng Việt Nam, ví dụ: 59G2-038.80',
      400,
      'INVALID_PLATE_FORMAT'
    );
  }
  req.body.plateNumber = normalized;
  req.body.category = req.body.category
    ? assertCategory(req.body.category)
    : DEFAULT_VEHICLE_CATEGORY;
  assertCategoryMatchesPlate(normalized, req.body.category);
  normalizeDescriptiveFields(req.body);
});

const validateUpdateVehicle = wrap((req) => {
  const editable = ['category', 'brand'];
  if (!editable.some((field) => req.body[field] !== undefined)) {
    throw new AppError(`Cần ít nhất một trường để cập nhật: ${editable.join(', ')}`, 400);
  }
  if (req.body.category !== undefined) {
    req.body.category = assertCategory(req.body.category);
  }
  normalizeDescriptiveFields(req.body);
});

module.exports = { validateCreateVehicle, validateUpdateVehicle };
