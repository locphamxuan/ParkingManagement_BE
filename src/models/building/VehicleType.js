const mongoose = require("mongoose");

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
    description: { type: String, trim: true, maxlength: 250, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleTypeSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("VehicleType", vehicleTypeSchema);
