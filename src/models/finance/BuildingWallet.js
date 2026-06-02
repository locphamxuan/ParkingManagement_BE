const mongoose = require('mongoose');

const buildingWalletSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      required: true,
      unique: true,
      index: true,
    },
    balance: { type: Number, default: 0, min: 0 },
    totalReceived: { type: Number, default: 0, min: 0 },   // Tổng tiền gửi xe nhận vào
    totalTransferred: { type: Number, default: 0, min: 0 }, // Tổng đã chuyển lên SystemWallet
  },
  { timestamps: true },
);

module.exports = mongoose.model('BuildingWallet', buildingWalletSchema);
