const mongoose = require("mongoose");

// Chính sách HOÀN TIỀN khi user hủy gói dài hạn (per building). Trước đây model
// này phục vụ đặt chỗ (reservation) — chức năng đó đã bỏ; giữ tên model/collection
// để không phải migrate dữ liệu, chỉ còn dùng refundPercent cho luồng hủy gói.
// Phí phạt vi phạm KHÔNG còn nằm ở đây — đã tách sang model ViolationType (1 mức
// phí riêng cho từng loại vi phạm, manager tự cấu hình per building).
const reservationPolicySchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      unique: true,
      index: true,
    },
    // % số tiền còn lại của gói được hoàn khi hủy (manager cấu hình).
    refundPercent: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReservationPolicy", reservationPolicySchema);
