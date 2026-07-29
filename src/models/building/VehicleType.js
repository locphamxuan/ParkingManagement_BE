const mongoose = require("mongoose");
const { VEHICLE_CLASSES } = require("../../constants/vehicleClass");

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
    // Canonical class this building vehicle type maps to (constants/vehicleClass.js).
    // null = chưa map → manager phải chọn; KHÔNG được đoán từ code/name lúc chạy.
    // Đây là nguồn sự thật DUY NHẤT cho việc gói dài hạn có bán được cho 1 biển số hay không.
    vehicleClass: {
      type: String,
      enum: [...VEHICLE_CLASSES, null],
      default: null,
    },
    description: { type: String, trim: true, maxlength: 250, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleTypeSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("VehicleType", vehicleTypeSchema);
