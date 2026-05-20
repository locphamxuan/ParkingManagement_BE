const mongoose = require("mongoose");

const SESSION_STATUS = ["active", "completed", "cancelled"];

const parkingSessionSchema = new mongoose.Schema(
  {
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
      default: null,
    },
    plateNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    entryGate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gate",
      default: null,
    },
    exitGate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gate",
      default: null,
    },
    entryTime: { type: Date, default: () => new Date() },
    exitTime: { type: Date, default: null },
    fee: { type: Number, default: 0, min: 0 },
    paymentMethod: {
      type: String,
      enum: ["cash", "wallet", "qr", "card", "long_term", null],
      default: null,
    },
    status: {
      type: String,
      enum: SESSION_STATUS,
      default: "active",
    },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

parkingSessionSchema.index({ building: 1, entryTime: -1 });

module.exports = mongoose.model("ParkingSession", parkingSessionSchema);
module.exports.SESSION_STATUS = SESSION_STATUS;
