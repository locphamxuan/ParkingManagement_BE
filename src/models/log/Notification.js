const mongoose = require('mongoose');

/**
 * In-app notification to a user — e.g. staff rejected a check-in/check-out and
 * the user needs to verify/update their vehicle info.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['checkin_rejected', 'checkout_rejected', 'general'],
      default: 'general',
    },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    plateNumber: { type: String, trim: true, default: null },
    building: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', default: null },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
