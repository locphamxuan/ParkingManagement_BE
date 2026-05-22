const mongoose = require("mongoose");

const systemWalletSchema = new mongoose.Schema(
  {
    balance: { type: Number, default: 0, min: 0 },
    totalDistributed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemWallet", systemWalletSchema);
