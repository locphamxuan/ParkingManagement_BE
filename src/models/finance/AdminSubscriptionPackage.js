const mongoose = require('mongoose');

const adminSubscriptionPackageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Package name is required'],
      trim: true,
      maxlength: 150,
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: 0,
    },
    durationDays: {
      type: Number,
      required: [true, 'durationDays is required'],
      min: 1,
    },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AdminSubscriptionPackage', adminSubscriptionPackageSchema);
