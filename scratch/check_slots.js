const mongoose = require('mongoose');
require('dotenv').config();
const { ParkingSlot, ParkingSession } = require('../src/models');

async function checkNonAvailable() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parking');
  
  const slots = await ParkingSlot.find({ status: { $ne: 'available' } }).populate('floor zone vehicleType');
  console.log('=== ALL NON-AVAILABLE SLOTS IN DB ===');
  for (const s of slots) {
    console.log({
      code: s.code,
      floor: s.floor?.name,
      status: s.status,
      reservable: s.reservable,
      usageType: s.usageType,
    });
  }

  const activeSessions = await ParkingSession.find({ status: 'active' }).populate('slot');
  console.log('\n=== ACTIVE PARKING SESSIONS ===');
  for (const sess of activeSessions) {
    console.log({
      slotCode: sess.slot?.code,
      status: sess.status,
    });
  }

  await mongoose.disconnect();
}
checkNonAvailable().catch(console.error);
