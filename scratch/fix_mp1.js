const mongoose = require('mongoose');
require('dotenv').config();
const { ParkingSlot } = require('../src/models');

async function fixMP01() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parking');
  await ParkingSlot.updateOne({ code: 'MP-01' }, { $set: { status: 'available', reservable: true } });
  console.log('Fixed MP-01 status to available!');
  await mongoose.disconnect();
}
fixMP01().catch(console.error);
