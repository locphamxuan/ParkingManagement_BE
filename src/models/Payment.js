const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', default: null },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSession', default: null },
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'LongTermSubscription', default: null },
    type: {
      type: String,
      enum: ['checkout', 'refund', 'adjustment', 'topup'],
      default: 'checkout',
    },
    method: {
      type: String,
      enum: ['cash', 'qr', 'wallet', 'card', 'other'],
      default: 'cash',
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'paid',
    },
    adjustmentReason: { type: String, default: null },
    note: { type: String, default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
