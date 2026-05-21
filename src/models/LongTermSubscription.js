const mongoose = require('mongoose');

const longTermSubscriptionSchema = new mongoose.Schema(
  {
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    packageName: { type: String, default: 'monthly' },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    startAt: { type: Date, default: Date.now },
    endAt: { type: Date, default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

longTermSubscriptionSchema.index({ plateNumber: 1, status: 1 });

const LongTermSubscription = mongoose.model('LongTermSubscription', longTermSubscriptionSchema);

module.exports = LongTermSubscription;
