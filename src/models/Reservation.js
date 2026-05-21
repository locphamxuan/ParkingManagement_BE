const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
  {
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    vehicleType: { type: String, default: 'car' },
    code: { type: String, required: true, trim: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSlot', default: null },
    status: {
      type: String,
      enum: ['pending', 'active', 'checked_in', 'expired', 'cancelled'],
      default: 'active',
    },
    holdUntil: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    checkedInAt: { type: Date, default: null },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

reservationSchema.index({ building: 1, plateNumber: 1, status: 1 });

const Reservation = mongoose.model('Reservation', reservationSchema);

module.exports = Reservation;
