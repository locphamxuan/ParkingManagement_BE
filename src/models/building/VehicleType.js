const mongoose = require("mongoose");
const { VEHICLE_CATEGORY_CODES } = require("../../constants/vehicle");

/**
 * Danh mục loại xe RIÊNG của từng tòa nhà: manager tự đặt tên/mã hiển thị
 * ("Ô tô 7 chỗ", "SEDAN"...) rồi gắn giá và ô đỗ theo đó.
 *
 * `category` neo mỗi danh mục vào một thể loại xe chuẩn của hệ thống
 * (constants/vehicle.js). Nhờ đó việc khớp xe của khách với danh mục của tòa là
 * TRA DỮ LIỆU, không còn đoán theo tên/mã bằng regex như trước.
 */
const vehicleTypeSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Vehicle type code is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: [true, "Vehicle type name is required"],
      trim: true,
      maxlength: 80,
    },
    // Thể loại xe chuẩn mà danh mục này của tòa đại diện (constants/vehicle.js).
    // null = manager chưa map → CHẶN bán gói dài hạn cho danh mục này, tuyệt đối
    // không đoán từ code/name lúc chạy. Đây là nguồn sự thật duy nhất để xét một
    // biển số có mua được gói hay không.
    category: {
      type: String,
      enum: {
        values: [...VEHICLE_CATEGORY_CODES, null],
        message: `category must be one of: ${VEHICLE_CATEGORY_CODES.join(", ")}`,
      },
      default: null,
    },
    description: { type: String, trim: true, maxlength: 250, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleTypeSchema.index({ building: 1, code: 1 }, { unique: true });
// Khớp xe của khách → danh mục của tòa lúc check-in.
vehicleTypeSchema.index({ building: 1, category: 1, isActive: 1 });

module.exports = mongoose.model("VehicleType", vehicleTypeSchema);
