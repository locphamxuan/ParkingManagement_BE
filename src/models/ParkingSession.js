const mongoose = require('mongoose');

const parkingSessionSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    vehicleType: { type: String, default: 'car' },
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    gate: { type: String },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reservation: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'ParkingSlot', default: null },
    sessionType: {
      type: String,
      enum: ['standard', 'long_term', 'reservation', 'forced'],
      default: 'standard',
    },
    checkInAt: { type: Date, default: Date.now },
    checkOutAt: { type: Date, default: null },
    status: { type: String, enum: ['active','closed','cancelled'], default: 'active' },
    fee: { type: Number, default: 0 },
    paymentMethod: { type: String, default: null },
    paymentStatus: { type: String, default: 'pending' },
    forceCheckoutReason: { type: String, default: null },
    mismatchBypassed: { type: Boolean, default: false },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

const ParkingSession = mongoose.model('ParkingSession', parkingSessionSchema);

module.exports = ParkingSession;
