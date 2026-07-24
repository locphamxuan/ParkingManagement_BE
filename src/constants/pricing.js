// Giá giờ mặc định (VND) khi tòa nhà CHƯA cấu hình PricePolicy — lưới an toàn
// để không bao giờ tính phí = 0. Theo loại xe.
const DEFAULT_HOURLY_RATE = { car: 20000, motorcycle: 5000 };

module.exports = { DEFAULT_HOURLY_RATE };
