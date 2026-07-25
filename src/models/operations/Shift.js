const mongoose = require("mongoose");
const { parseTime } = require("../../utils/businessTime");

const shiftSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Shift name is required"],
      trim: true,
      maxlength: 80,
    },
    code: {
      type: String,
      required: [true, "Shift code is required"],
      uppercase: true,
      trim: true,
      maxlength: 30,
    },
    startTime: {
      type: String,
      required: [true, "startTime is required (HH:mm)"],
    },
    endTime: {
      type: String,
      required: [true, "endTime is required (HH:mm)"],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
shiftSchema.path("endTime").validate(function validateShiftWindow(endTime) {
  return (
    parseTime(this.startTime) !== null &&
    parseTime(endTime) !== null &&
    this.startTime !== endTime
  );
}, "Shift hours must use distinct HH:mm start/end values");

shiftSchema.index({ building: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Shift", shiftSchema);
