const mongoose = require('mongoose');
require('dotenv').config();
const { ParkingSlot, ParkingSession, LongTermSubscription } = require('../src/models');

async function checkTang3Usage() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parking');
  
  const slots = await ParkingSlot.find({ floor: '6a5729bebbdfa07f7d73acfe' });
  const slotIds = slots.map(s => s._id);

  const activeSessions = await ParkingSession.find({ slot: { $in: slotIds }, status: 'active' });
  console.log('Active sessions on Tầng 3:', activeSessions.length);

  const activeSubs = await LongTermSubscription.find({ slot: { $in: slotIds }, status: 'active' });
  console.log('Active subscriptions on Tầng 3:', activeSubs.length);

  await mongoose.disconnect();
}
checkTang3Usage().catch(console.error);
