const mongoose = require("mongoose");

const longTermPackageSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Package name is required"],
      trim: true,
      maxlength: 150,
    },
    code: {
      type: String,
      required: [true, "Package code is required"],
      uppercase: true,
      trim: true,
      maxlength: 30,
    },
    durationDays: {
      type: Number,
      required: [true, "durationDays is required"],
      min: 1,
    },
    price: {
      type: Number,
      required: [true, "price is required"],
      min: 0,
    },
    reservedSlots: {
      type: Number,
      default: 0,
      min: 0,
    },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    // Số giờ đỗ tối đa/ngày được miễn phí của gói. Đậu quá sẽ tính phí phần dư
    // theo PricePolicy thường (manager set). 0 = không giới hạn.
    // Gợi ý mặc định theo thời hạn: tuần 5h, tháng 7h, năm 10h (cả xe máy & ô tô).
    maxHoursPerDay: { type: Number, default: 0, min: 0 },
    // When true, subscribers can reserve a specific dedicated parking slot.
    allowDedicatedSlot: { type: Boolean, default: false },
    benefits: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

longTermPackageSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("LongTermPackage", longTermPackageSchema);
