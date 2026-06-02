const mongoose = require('mongoose');

const operatingHoursSchema = new mongoose.Schema(
  {
    open: { type: String, required: true },
    close: { type: String, required: true },
  },
  { _id: false }
);

const pricingSchema = new mongoose.Schema(
  {
    hourlyRate: {
      type: Number,
      required: [true, 'Hourly rate is required'],
      min: [0, 'Hourly rate cannot be negative'],
    },
    dailyCap: {
      type: Number,
      default: null,
      min: [0, 'Daily cap cannot be negative'],
    },
    motorcycleMultiplier: {
      type: Number,
      default: 0.6,
      min: [0, 'Multiplier cannot be negative'],
    },
  },
  { _id: false }
);

const buildingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Building name is required'],
      trim: true,
      maxlength: [150, 'Name cannot exceed 150 characters'],
    },
    code: {
      type: String,
      required: [true, 'Building code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Code cannot exceed 20 characters'],
    },
    address: {
      street: { type: String, trim: true },
      ward: { type: String, trim: true },
      district: { type: String, trim: true },
      city: { type: String, trim: true },
      fullAddress: { type: String, trim: true },
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    totalFloors: {
      type: Number,
      required: [true, 'Total floors is required'],
      min: [1, 'Building must have at least 1 floor'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive', 'maintenance'],
        message: 'Status must be active, inactive, or maintenance',
      },
      default: 'active',
    },
    operatingHours: {
      type: operatingHoursSchema,
      default: () => ({ open: '06:00', close: '22:00' }),
    },
    pricing: {
      type: pricingSchema,
      required: true,
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

buildingSchema.index({ status: 1 });
buildingSchema.index({ manager: 1 });
buildingSchema.index({ location: '2dsphere' }, { sparse: true });

buildingSchema.virtual('floors', {
  ref: 'Floor',
  localField: '_id',
  foreignField: 'building',
});

const Building = mongoose.model('Building', buildingSchema);

module.exports = Building;
