const mongoose = require("mongoose");

const pricePolicySchema = new mongoose.Schema(
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
      required: [true, "Price policy name is required"],
      trim: true,
      maxlength: 120,
    },
    hourlyRate: {
      type: Number,
      required: [true, "hourlyRate is required"],
      min: 0,
    },
    // Loại giá: regular = giờ thường, peak = giờ cao điểm.
    type: {
      type: String,
      enum: ['regular', 'peak'],
      default: 'regular',
    },
    timeWindow: {
      from: { type: String, default: "00:00" }, // Dùng cho peak: giờ bắt đầu cao điểm
      to: { type: String, default: "23:59" },   // Dùng cho peak: giờ kết thúc cao điểm
    },
    effectiveFrom: { type: Date, default: () => new Date() },
    effectiveTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pricePolicySchema.index({ building: 1, vehicleType: 1, isActive: 1 });

// Khi activate policy mới (isActive → true), tự deactivate các policy cùng
// (building, vehicleType, type) đang active → tránh 2 regular policy cùng hiệu lực.
pricePolicySchema.pre('save', async function (next) {
  if (this.isActive && (this.isModified('isActive') || this.isNew)) {
    await this.constructor.updateMany(
      {
        _id: { $ne: this._id },
        building: this.building,
        vehicleType: this.vehicleType,
        type: this.type,
        isActive: true,
      },
      { $set: { isActive: false } },
    );
  }
  next();
});

module.exports = mongoose.model("PricePolicy", pricePolicySchema);
