const mongoose = require('mongoose');
require('dotenv').config();
const { LongTermSubscription, ParkingSession } = require('../src/models');

async function checkSubs() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parking');
  
  const subs = await LongTermSubscription.find().populate('slot user');
  console.log('=== LONG TERM SUBSCRIPTIONS IN DB ===');
  for (const s of subs) {
    console.log({
      _id: s._id,
      user: s.user?.email || s.user?.fullName,
      slotCode: s.slot?.code,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate
    });
  }

  await mongoose.disconnect();
}
checkSubs().catch(console.error);
