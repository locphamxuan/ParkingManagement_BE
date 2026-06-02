const mongoose = require("mongoose");

const RESERVATION_STATUS = [
  "pending",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "expired",
];

const reservationSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      unique: true,
      maxlength: 30,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    slot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ParkingSlot",
      default: null,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VehicleType",
      required: true,
    },
    plateNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    // Amount actually charged to the user's wallet when booking (deposit).
    fee: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: RESERVATION_STATUS,
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reservation", reservationSchema);
module.exports.RESERVATION_STATUS = RESERVATION_STATUS;
