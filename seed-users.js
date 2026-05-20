require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI;

const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role:     { type: String, enum: ['admin','manager','staff','user'], required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const SEED_USERS = [
  { email: 'manager@gmail.com', password: 'manager', fullName: 'Manager PBMS', role: 'manager' },
  { email: 'admin@gmail.com',   password: 'admin',   fullName: 'Admin PBMS',   role: 'admin'   },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[DB] Connected');

  for (const u of SEED_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      console.log(`[SKIP] ${u.email} already exists (role: ${existing.role})`);
      continue;
    }
    const hashed = await bcrypt.hash(u.password, 10);
    await User.create({ ...u, password: hashed });
    console.log(`[OK]   Created ${u.email} — role: ${u.role}`);
  }

  await mongoose.disconnect();
  console.log('[DONE]');
}

seed().catch((err) => { console.error(err); process.exit(1); });
