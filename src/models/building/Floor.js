const mongoose = require("mongoose");

const floorSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
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
      maxlength: 100,
    },
    levelNumber: {
      type: Number,
      required: [true, "Floor level number is required"],
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
