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
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

longTermPackageSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("LongTermPackage", longTermPackageSchema);
