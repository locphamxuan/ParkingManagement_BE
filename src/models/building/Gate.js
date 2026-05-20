const mongoose = require("mongoose");

const gateSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: [true, "Gate code is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: [true, "Gate name is required"],
      trim: true,
      maxlength: 100,
    },
    direction: {
      type: String,
      enum: ["in", "out", "both"],
      default: "both",
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

gateSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Gate", gateSchema);
