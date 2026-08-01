

const VEHICLE_CATEGORIES = Object.freeze([
  { code: 'motorcycle', label: 'Xe máy', wheels: 2 },
  { code: 'ebike', label: 'Xe đạp điện', wheels: 2 },
  { code: 'emotorbike', label: 'Xe máy điện', wheels: 2 },
  { code: 'car', label: 'Ô tô', wheels: 4 },
  { code: 'suv', label: 'Xe SUV', wheels: 4 },
  { code: 'truck', label: 'Xe tải', wheels: 4 },
  { code: 'other', label: 'Loại khác', wheels: 4 },
]);

const VEHICLE_CATEGORY_CODES = Object.freeze(VEHICLE_CATEGORIES.map((c) => c.code));

const DEFAULT_VEHICLE_CATEGORY = 'car';

/** Hai nhóm tính phí / khớp ô đỗ. Suy ra từ `wheels`, không khai báo tay ở nơi khác. */
const VEHICLE_KINDS = Object.freeze(['motorcycle', 'car']);

const CATEGORY_BY_CODE = new Map(VEHICLE_CATEGORIES.map((c) => [c.code, c]));

const isVehicleCategory = (code) => CATEGORY_BY_CODE.has(`${code || ''}`.toLowerCase());

/**
 * Quy một category về nhóm tính phí ('motorcycle' | 'car').
 * Category lạ/thiếu → 'car' (nhóm mặc định, khớp DEFAULT_VEHICLE_CATEGORY).
 */
const kindOfCategory = (code) =>
  CATEGORY_BY_CODE.get(`${code || ''}`.toLowerCase())?.wheels === 2 ? 'motorcycle' : 'car';

const labelOfCategory = (code) =>
  CATEGORY_BY_CODE.get(`${code || ''}`.toLowerCase())?.label || null;

/** Category hợp lệ → chuỗi đã chuẩn hoá; còn lại → null (KHÔNG đoán giá trị mặc định). */
const normalizeCategory = (code) => {
  const normalized = `${code || ''}`.trim().toLowerCase();
  return CATEGORY_BY_CODE.has(normalized) ? normalized : null;
};

/**
 * Điều kiện MUA GÓI dài hạn: xe của khách chỉ mua được gói mà danh mục loại xe của
 * tòa trỏ đúng THỂ LOẠI của nó — so khớp tuyệt đối, không nới sang cùng nhóm 2/4
 * bánh và không suy từ tên/mã danh mục. `VehicleType` chưa map category (null) thì
 * trả false để phía gọi báo manager đi cấu hình, thay vì đoán bừa lúc chạy.
 *
 * Cố ý KHÁC `kindOfCategory` ở trên: nhóm 2/4 bánh chỉ dùng để khớp ô đỗ vật lý
 * (ô xe máy không chứa được xe tải), không dùng để xét quyền mua gói.
 */
const isCategoryEligible = (vehicleCategory, packageCategory) => {
  const vehicle = normalizeCategory(vehicleCategory);
  const target = normalizeCategory(packageCategory);
  return Boolean(vehicle && target && vehicle === target);
};

module.exports = {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_CODES,
  DEFAULT_VEHICLE_CATEGORY,
  VEHICLE_KINDS,
  isVehicleCategory,
  normalizeCategory,
  isCategoryEligible,
  kindOfCategory,
  labelOfCategory,
};
