require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

// Inline schemas to avoid path issues
const userSchema = new mongoose.Schema({
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  fullName:          { type: String, required: true },
  role:              { type: String, enum: ['admin', 'manager', 'staff', 'user'], required: true },
  isActive:          { type: Boolean, default: true },
  assignedBuildings: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Building' }],
}, { timestamps: true });

const buildingSchema = new mongoose.Schema({
  name:           { type: String, required: true, trim: true },
  code:           { type: String, required: true, unique: true, uppercase: true, trim: true },
  address:        { street: String, ward: String, district: String, city: String, fullAddress: String },
  description:    String,
  manager:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  totalFloors:    { type: Number, required: true, min: 1 },
  status:         { type: String, enum: ['active', 'inactive', 'maintenance'], default: 'active' },
  operatingHours: { open: { type: String, default: '06:00' }, close: { type: String, default: '22:00' } },
  pricing:        { hourlyRate: { type: Number, required: true, min: 0 }, dailyCap: Number, motorcycleMultiplier: { type: Number, default: 0.6 } },
  contactPhone:   String,
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

const buildingManagerSchema = new mongoose.Schema({
  building:   { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedAt: { type: Date, default: () => new Date() },
  revokedAt:  { type: Date, default: null },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

buildingManagerSchema.index({ building: 1, user: 1 }, { unique: true });

const User            = mongoose.models.User            || mongoose.model('User',            userSchema);
const Building        = mongoose.models.Building        || mongoose.model('Building',        buildingSchema);
const BuildingManager = mongoose.models.BuildingManager || mongoose.model('BuildingManager', buildingManagerSchema);

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[DB] Connected');

  const manager = await User.findOne({ email: 'manager@gmail.com' });
  if (!manager) {
    console.error('[ERR] manager@gmail.com not found — run seed-users.js first');
    process.exit(1);
  }
  console.log(`[OK]  Found manager: ${manager._id}`);

  // Create building if not exists
  let building = await Building.findOne({ code: 'CAOOKBLD' });
  if (!building) {
    building = await Building.create({
      name:           'Cao Ốc Building',
      code:           'CAOOKBLD',
      address:        { city: 'Hải Phòng', fullAddress: 'Hải Phòng, Việt Nam' },
      totalFloors:    5,
      pricing:        { hourlyRate: 5000, dailyCap: 50000, motorcycleMultiplier: 0.6 },
      operatingHours: { open: '06:00', close: '22:00' },
      status:         'active',
      manager:        manager._id,
    });
    console.log(`[OK]  Created building: ${building._id} — ${building.name}`);
  } else {
    console.log(`[SKIP] Building already exists: ${building._id} — ${building.name}`);
    // Ensure manager field is set
    await Building.updateOne({ _id: building._id }, { $set: { manager: manager._id } });
  }

  // Upsert BuildingManager record
  const existing = await BuildingManager.findOne({ building: building._id, user: manager._id });
  if (!existing) {
    await BuildingManager.create({ building: building._id, user: manager._id });
    console.log('[OK]  Created BuildingManager assignment');
  } else if (!existing.isActive) {
    await BuildingManager.updateOne({ _id: existing._id }, { $set: { isActive: true, revokedAt: null, assignedAt: new Date() } });
    console.log('[OK]  Reactivated BuildingManager assignment');
  } else {
    console.log('[SKIP] Assignment already active');
  }

  // Sync user.assignedBuildings
  await User.updateOne({ _id: manager._id }, { $set: { assignedBuildings: [building._id] } });
  console.log('[OK]  Synced manager.assignedBuildings');

  await mongoose.disconnect();
  console.log('[DONE] manager@gmail.com => Cao Ốc Building (Hải Phòng)');
}

seed().catch((err) => { console.error(err); process.exit(1); });
