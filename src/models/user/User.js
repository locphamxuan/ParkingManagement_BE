const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ROLE_LIST, ROLES } = require('../../constants/roles');
const { isValidVietnamPlate } = require('../../utils/plate.util');

// Unique opaque QR token for a license plate (staff scans this to identify the vehicle/owner).
const generatePlateQrCode = () => `PLT-${crypto.randomBytes(8).toString('hex')}`;

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
          validate: {
            validator: isValidVietnamPlate,
            message: 'Biển số không hợp lệ (định dạng Việt Nam, ví dụ: 59G2-038.80)',
          },
        },
        vehicleType: {
          type: String,
          enum: ['motorcycle', 'car', 'ebike', 'emotorbike', 'suv', 'truck', 'other'],
          default: 'car',
        },
        // Vehicle make chosen by the user (e.g. Toyota, Honda, VinFast). Optional.
        brand: {
          type: String,
          trim: true,
          maxlength: [50, 'Brand cannot exceed 50 characters'],
          default: null,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        // Unique QR token auto-generated per plate; scanned by staff to identify the vehicle.
        qrCode: {
          type: String,
          default: generatePlateQrCode,
          index: true,
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
    resetPasswordToken: {
      type: String,
      select: false,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
      default: null,
    },
    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Brute-force lockout: số lần nhập sai liên tiếp + mốc hết khóa.
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
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
module.exports.generatePlateQrCode = generatePlateQrCode;
