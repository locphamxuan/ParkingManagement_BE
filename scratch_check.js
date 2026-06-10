const mongoose = require('mongoose');
require('dotenv').config();

const ParkingSessionSchema = new mongoose.Schema({}, { strict: false });
const ParkingSession = mongoose.models.ParkingSession || mongoose.model('ParkingSession', ParkingSessionSchema, 'parkingsessions');
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/parking_db');
    console.log('Connected to MongoDB');

    const u = await User.findOne({ email: 'leghenkiz@gmail.com' });
    if (!u) {
      console.log('User leghenkiz@gmail.com not found');
      return;
    }

    const sessions = await ParkingSession.find({ user: u._id });
    console.log(`\n=== SESSIONS FOR USER leghenkiz@gmail.com (${sessions.length}) ===`);
    sessions.forEach(s => {
      console.log(`ID: ${s._id}, Plate: ${s.plateNumber}, Status: ${s.status}, Reservation: ${s.reservation || 'null'}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

run();
