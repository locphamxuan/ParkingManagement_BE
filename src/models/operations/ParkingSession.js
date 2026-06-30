const mongoose = require("mongoose");
const { isValidVietnamPlate } = require("../../utils/plate.util");

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
      validate: {
        validator: isValidVietnamPlate,
        message: "Biển số không hợp lệ (định dạng Việt Nam, ví dụ: 59G2-038.80)",
      },
    },
    // Vehicle make recognized by the AI camera at check-in (e.g. Toyota, VinFast).
    vehicleBrand: {
      type: String,
      trim: true,
      default: null,
    },
    // Snapshot of the license-plate camera (Camera 1) captured at check-in.
    // Stored as a base64 data-URL so it can be rendered directly by the FE.
    plateImage: {
      type: String,
      default: null,
    },
    // Snapshot of the portrait camera — the driver portrait captured at check-in
    // for evidence / so staff can compare the person at check-out.
    portraitImage: {
      type: String,
      default: null,
    },
    // Snapshots captured at CHECK-OUT (xe ra) for evidence / đối chiếu:
    //  - exitPlateImage    : license-plate camera lúc ra
    //  - exitPortraitImage : portrait camera (người lấy xe) lúc ra
    exitPlateImage: {
      type: String,
      default: null,
    },
    exitPortraitImage: {
      type: String,
      default: null,
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
      enum: ["cash", "wallet", "qr", "card", "payos", "long_term", null],
      default: null,
    },
    status: {
      type: String,
      enum: SESSION_STATUS,
      default: "active",
    },
    note: { type: String, trim: true, default: "" },
    reservation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      default: null,
    },
  },
  { timestamps: true }
);

parkingSessionSchema.index({ building: 1, entryTime: -1 });
parkingSessionSchema.index({ building: 1, status: 1 });       // active sessions per building
parkingSessionSchema.index({ plateNumber: 1, status: 1 });    // check-in duplicate-plate check
parkingSessionSchema.index({ user: 1, createdAt: -1 });       // user parking history (sorted)

module.exports = mongoose.model("ParkingSession", parkingSessionSchema);
module.exports.SESSION_STATUS = SESSION_STATUS;
