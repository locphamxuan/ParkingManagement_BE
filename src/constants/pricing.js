// Giá giờ mặc định (VND) khi tòa nhà CHƯA cấu hình PricePolicy — lưới an toàn
// để không bao giờ tính phí = 0. Theo loại xe.
const DEFAULT_HOURLY_RATE = { car: 20000, motorcycle: 5000 };

// Giá fallback chung khi không xác định được loại xe (vd ước tính reservation
// theo vehicleTypeId mà building chưa có pricing).
const FALLBACK_HOURLY_RATE = 5000;

module.exports = { DEFAULT_HOURLY_RATE, FALLBACK_HOURLY_RATE };
