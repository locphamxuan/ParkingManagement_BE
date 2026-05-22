const mongoose = require("mongoose");

const shiftRevenueSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    staffShift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffShift",
      default: null,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workDate: { type: Date, required: true },
    sessionCount: { type: Number, default: 0, min: 0 },
    totalRevenue: { type: Number, default: 0, min: 0 },
    cashAmount: { type: Number, default: 0, min: 0 },
    walletAmount: { type: Number, default: 0, min: 0 },
    qrAmount: { type: Number, default: 0, min: 0 },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    reconciled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

shiftRevenueSchema.index({ building: 1, workDate: 1 });

module.exports = mongoose.model("ShiftRevenue", shiftRevenueSchema);
