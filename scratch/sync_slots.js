const mongoose = require('mongoose');
require('dotenv').config();
const { ParkingSession, ParkingSlot } = require('../src/models');

async function syncDb() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parking');
  const activeSessions = await ParkingSession.find({ status: 'active', slot: { $ne: null } });
  console.log('Active sessions count:', activeSessions.length);
  for (const s of activeSessions) {
    const slot = await ParkingSlot.findById(s.slot);
    if (slot && slot.status !== 'occupied') {
      console.log('Syncing slot:', slot.code, 'from', slot.status, 'to occupied (active session:', s.plateNumber, ')');
      slot.status = 'occupied';
      await slot.save();
    } else {
      console.log('Slot', slot?.code, 'is already occupied for session', s.plateNumber);
    }
  }
  await mongoose.disconnect();
}
syncDb().catch(console.error);
