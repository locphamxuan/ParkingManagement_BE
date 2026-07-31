const mongoose = require('mongoose');

const buildingWalletTransactionSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    // 'reservation_fee' là lý do LỊCH SỬ (tính năng đặt chỗ theo giờ đã bỏ) — giữ
    // trong enum để đọc được sổ quỹ cũ; KHÔNG còn bản ghi mới nào dùng giá trị này.
    reason: {
      type: String,
      enum: ['parking_fee', 'reservation_fee', 'subscription_fee', 'penalty_fee', 'transfer_to_system', 'refund', 'topup'],
      required: true,
    },
    relatedPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    note: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true },
);

buildingWalletTransactionSchema.index({ building: 1, createdAt: -1 });

module.exports = mongoose.model('BuildingWalletTransaction', buildingWalletTransactionSchema);
