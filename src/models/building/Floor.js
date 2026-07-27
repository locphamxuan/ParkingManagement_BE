const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    // code do hệ thống tự sinh (F1, F2…) — khóa nội bộ, không cho client đặt.
    code: {
      type: String,
      required: [true, "Floor code is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: [true, "Floor name is required"],
      trim: true,
      maxlength: 80,
    },
    capacity: {
      type: Number,
      required: [true, "Floor capacity is required"],
      min: [0, "Capacity must be >= 0"],
    },
    allowedVehicleTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VehicleType",
      },
    ],
    pricePolicy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PricePolicy",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
    },
  },
  { timestamps: true }
);

floorSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Floor", floorSchema);
