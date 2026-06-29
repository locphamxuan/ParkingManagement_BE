const mongoose = require("mongoose");

// Đối tượng sử dụng của một dãy (zone) — chiều "ai được đậu", trực giao với loại xe.
//  - walk_in    : khách vãng lai (không tài khoản / không gói / không đặt chỗ)
//  - registered : user có tài khoản & biển số đăng ký nhưng không gói/đặt chỗ
//  - subscriber : xe mua gói dài hạn (long-term subscription)
//  - reserved   : dãy dành cho lượt đặt chỗ trước (reservation)
const ZONE_USAGE_TYPES = ["walk_in", "registered", "subscriber", "reserved"];

const zoneSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    floor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Zone code is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: { type: String, trim: true, maxlength: 80, default: "" },
    // Loại xe của dãy (ràng buộc vật lý) — mọi slot trong dãy mang loại xe này.
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      required: [true, "Zone vehicleType is required"],
    },
    // Đối tượng sử dụng của dãy (chính sách phân bổ).
    usageType: {
      type: String,
      enum: ZONE_USAGE_TYPES,
      required: [true, "Zone usageType is required"],
    },
    capacity: { type: Number, min: [0, "Capacity must be >= 0"], default: 0 },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
    },
  },
  { timestamps: true }
);

zoneSchema.index({ floor: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Zone", zoneSchema);
module.exports.ZONE_USAGE_TYPES = ZONE_USAGE_TYPES;
