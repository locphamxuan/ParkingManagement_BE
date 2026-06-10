const mongoose = require("mongoose");

const STAFF_SHIFT_STATUS = ["scheduled", "active", "completed", "cancelled"];

const staffShiftSchema = new mongoose.Schema(
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
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Cổng được manager phân công cho nhân viên trong ca này (ra / vào).
    gate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gate",
      default: null,
    },
    workDate: {
      type: Date,
      required: [true, "workDate is required"],
    },
    status: {
      type: String,
      enum: STAFF_SHIFT_STATUS,
      default: "scheduled",
    },
    note: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true }
);

staffShiftSchema.index({ staff: 1, workDate: 1, shift: 1 }, { unique: true });

module.exports = mongoose.model("StaffShift", staffShiftSchema);
module.exports.STAFF_SHIFT_STATUS = STAFF_SHIFT_STATUS;
