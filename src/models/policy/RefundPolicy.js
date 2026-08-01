const mongoose = require("mongoose");

// Chính sách HOÀN TIỀN khi user hủy gói dài hạn (per building) — chỉ còn
// refundPercent. Phí phạt vi phạm KHÔNG nằm ở đây: đã tách sang model
// ViolationType (mỗi loại vi phạm một mức phí, manager tự cấu hình per building).
//
// Tên collection được ghim thủ công vì dữ liệu đang chạy nằm ở collection cũ;
// đổi tên model mà không ghim sẽ khiến mongoose trỏ sang collection rỗng và mọi
// tòa nhà mất chính sách hoàn tiền đã cấu hình.
const refundPolicySchema = new mongoose.Schema(
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
  { timestamps: true, collection: "reservationpolicies" }
);

module.exports = mongoose.model("RefundPolicy", refundPolicySchema);
