const mongoose = require('mongoose');

// Bảng giá phạt vi phạm do MANAGER tự cấu hình theo building (không hard code mức
// phạt trong code) — thay cho ReservationPolicy.ruleViolationFee (1 mức chung cho
// mọi loại vi phạm). Mỗi violation type gắn 1 mức phí cố định: khi manager duyệt
// phạt (penalize_violator) cho 1 incident có type khớp code này, phí bị áp ĐÚNG
// giá trị ở đây — manager không được nhập tay số khác (chặn set phí tuỳ tiện/quá cao).
// Chỉ incident type='other' mới cho phép manager tự nhập phí thủ công.
const violationTypeSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
      index: true,
    },
    // Slug định danh — dùng làm giá trị Incident.type khi user báo cáo vi phạm này.
    code: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 60,
    },
    label: {
      type: String,
      required: [true, 'label is required'],
      trim: true,
      maxlength: 150,
    },
    fee: {
      type: Number,
      required: [true, 'fee is required'],
      min: 0,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

violationTypeSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('ViolationType', violationTypeSchema);
