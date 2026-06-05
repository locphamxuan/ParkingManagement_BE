const mongoose = require('mongoose');

/**
 * Tracks a building's active admin-system subscription.
 *
 * A manager must hold an active subscription (endDate in the future) for their
 * building before they can access the manager dashboard / resource APIs.
 * Each building has exactly one subscription record (extended on re-purchase).
 */
const managerSubscriptionSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
      unique: true,
      index: true,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    package: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminSubscriptionPackage',
      default: null,
    },
    packageName: { type: String, default: '' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true, index: true },
    lastAmountPaid: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ManagerSubscription', managerSubscriptionSchema);
