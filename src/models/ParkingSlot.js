const mongoose = require('mongoose');

const parkingSlotSchema = new mongoose.Schema(
  {
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    code: { type: String, required: true, trim: true },
    floor: { type: String, default: null },
    status: {
      type: String,
      enum: ['available', 'reserved', 'occupied', 'maintenance'],
      default: 'available',
    },
  },
  { timestamps: true }
);

parkingSlotSchema.index({ building: 1, code: 1 }, { unique: true });

const ParkingSlot = mongoose.model('ParkingSlot', parkingSlotSchema);

module.exports = ParkingSlot;
