// Sinh mã tham chiếu ngắn dạng `<PREFIX>-<base36 time>-<random>`. Hiện chỉ dùng cho
// mã sự cố (Incident, prefix 'INC') — mọi caller đều truyền prefix tường minh.
const generateBookingCode = (prefix = 'INC') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

module.exports = generateBookingCode;
