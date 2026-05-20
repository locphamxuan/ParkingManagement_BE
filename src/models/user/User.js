const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLE_LIST, ROLES } = require('../../constants/roles');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^[0-9+\-\s()]{8,20}$/, 'Please provide a valid phone number'],
    },
    role: {
      type: String,
      enum: {
        values: ROLE_LIST,
        message: `Role must be one of: ${ROLE_LIST.join(', ')}`,
      },
      default: ROLES.USER,
      required: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    licensePlates: [
      {
        plateNumber: {
          type: String,
          required: true,
          uppercase: true,
          trim: true,
        },
        vehicleType: {
          type: String,
          enum: ['motorcycle', 'car', 'suv', 'truck', 'other'],
          default: 'car',
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
      },
    ],
    assignedBuildings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Building',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword
) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
