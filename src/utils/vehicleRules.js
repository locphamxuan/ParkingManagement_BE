const AppError = require('./AppError');
const { plateVehicleKind } = require('./plate.util');
const { kindOfCategory, labelOfCategory } = require('../constants/vehicle');

/**
 * Thể loại xe khai báo phải khớp nhóm suy ra từ sê-ri biển số.
 *
 * `category` quyết định bảng giá và ô đỗ tương thích, nên khai ô tô thành xe máy
 * (hoặc ngược lại) là thu sai tiền và gán sai ô. Trước đây hai trường này được
 * kiểm tra hoàn toàn độc lập ở cả FE lẫn BE nên sai lệch lọt thẳng vào DB.
 *
 * Biển đặc biệt/liên doanh (2 chữ cái như 51LD, 80NG) không theo quy tắc sê-ri →
 * `plateVehicleKind` trả null và ta bỏ qua, thà lọt còn hơn từ chối oan.
 *
 * Đặt ở module riêng vì luật này cần cho CẢ lúc tạo (validator, có biển trong
 * body) lẫn lúc đổi thể loại (service, biển nằm trên document).
 */
const assertCategoryMatchesPlate = (plateNumber, category) => {
  const plateKind = plateVehicleKind(plateNumber);
  if (!plateKind) return;
  if (plateKind === kindOfCategory(category)) return;

  const expected = plateKind === 'motorcycle' ? 'xe máy' : 'ô tô';
  throw new AppError(
    `Biển số ${plateNumber} là biển ${expected}, không khớp thể loại "${labelOfCategory(category)}" đã chọn`,
    400,
    'PLATE_CATEGORY_MISMATCH'
  );
};

module.exports = { assertCategoryMatchesPlate };
