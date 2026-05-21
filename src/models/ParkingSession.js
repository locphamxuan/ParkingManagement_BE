const mongoose = require('mongoose');

const parkingSessionSchema = new mongoose.Schema(
  {
    plateNumber: { type: String, required: true, uppercase: true, trim: true },
    vehicleType: { type: String, default: 'car' },
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
    gate: { type: String },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkInAt: { type: Date, default: Date.now },
    checkOutAt: { type: Date, default: null },
    status: { type: String, enum: ['active','closed','cancelled'], default: 'active' },
    fee: { type: Number, default: 0 },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

const ParkingSession = mongoose.model('ParkingSession', parkingSessionSchema);

module.exports = ParkingSession;
