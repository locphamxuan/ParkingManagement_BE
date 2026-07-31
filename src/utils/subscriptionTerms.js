/**
 * Điều khoản đã mua của một gói dài hạn.
 *
 * Nguồn sự thật là `subscription.purchasedTerms` (snapshot bất biến lúc mua/gia hạn).
 * Chỉ khi bản ghi CŨ chưa được backfill mới rơi về `subscription.package` đang sống —
 * lúc đó `source: 'live_package'` để nơi gọi biết con số có thể đã bị manager sửa.
 */
const { normalizeCategory } = require('../constants/vehicle');

const idOf = (value) => (value?._id ? value._id : value) || null;

/** Snapshot điều khoản từ package tại thời điểm trả tiền. */
const buildPurchasedTerms = (pkg, { vehicleCategory = null, purchasedAt = new Date(), backfilled = false } = {}) => ({
  packageId: idOf(pkg?._id ? pkg : pkg),
  packageCode: pkg?.code ?? null,
  packageName: pkg?.name ?? null,
  price: Number.isFinite(Number(pkg?.price)) ? Number(pkg.price) : null,
  durationDays: Number.isFinite(Number(pkg?.durationDays)) ? Number(pkg.durationDays) : null,
  maxHoursPerDay: Number.isFinite(Number(pkg?.maxHoursPerDay)) ? Number(pkg.maxHoursPerDay) : 0,
  vehicleType: idOf(pkg?.vehicleType),
  vehicleCategory: normalizeCategory(vehicleCategory ?? pkg?.vehicleType?.category),
  purchasedAt,
  backfilled,
});

/**
 * Điều khoản có hiệu lực để TÍNH TIỀN (hoàn tiền, phí vượt giờ, hiển thị lịch sử).
 * `subscription.package` phải được populate nếu muốn có fallback cho dữ liệu cũ.
 */
const effectiveTerms = (subscription) => {
  const stored = subscription?.purchasedTerms;
  const hasStored = stored && (stored.price !== null && stored.price !== undefined);
  if (hasStored) {
    return {
      source: stored.backfilled ? 'backfilled_snapshot' : 'purchase_snapshot',
      packageId: stored.packageId || idOf(subscription.package),
      packageCode: stored.packageCode,
      packageName: stored.packageName,
      price: Number(stored.price) || 0,
      durationDays: Number(stored.durationDays) || 0,
      maxHoursPerDay: Number(stored.maxHoursPerDay) || 0,
      vehicleType: stored.vehicleType || null,
      vehicleCategory: stored.vehicleCategory || stored.vehicleClass || null,
    };
  }

  const pkg = subscription?.package && typeof subscription.package === 'object'
    ? subscription.package
    : null;
  return {
    source: 'live_package',
    packageId: idOf(subscription?.package),
    packageCode: pkg?.code ?? null,
    packageName: pkg?.name ?? null,
    price: Number(pkg?.price) || 0,
    durationDays: Number(pkg?.durationDays) || 0,
    maxHoursPerDay: Number(pkg?.maxHoursPerDay) || 0,
    vehicleType: idOf(pkg?.vehicleType),
    vehicleCategory: normalizeCategory(pkg?.vehicleType?.category),
  };
};

module.exports = { buildPurchasedTerms, effectiveTerms };
