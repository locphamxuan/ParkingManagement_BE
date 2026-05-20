const mongoose = require("mongoose");

const PARKING_SLOT_STATUS = [
  "available",
  "occupied",
  "reserved",
  "maintenance",
];

const parkingSlotSchema = new mongoose.Schema(
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
      required: [true, "Slot code is required"],
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      default: null,
    },
    status: {
      type: String,
      enum: PARKING_SLOT_STATUS,
      default: "available",
    },
    reservable: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 250, default: "" },
  },
  { timestamps: true }
);

parkingSlotSchema.index({ floor: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("ParkingSlot", parkingSlotSchema);
module.exports.PARKING_SLOT_STATUS = PARKING_SLOT_STATUS;
