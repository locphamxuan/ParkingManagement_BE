const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    type: {
      type: String,
      enum: ['debit', 'credit', 'refund'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['success', 'failed'], default: 'success' },
    reason: { type: String, default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;
