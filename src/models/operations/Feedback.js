const mongoose = require('mongoose');

const FEEDBACK_STATUS = ['pending', 'resolved'];

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Building',
      default: null,
      index: true,
    },
    parkingSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParkingSession',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'rating must be an integer from 1 to 5',
      },
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: FEEDBACK_STATUS,
      default: 'pending',
      index: true,
    },
    staffReply: {
      type: String,
      trim: true,
      default: null,
      maxlength: 1000,
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    portraitImageUrl: {
      type: String,
      trim: true,
      default: null,
      maxlength: 2048,
    },
    plateImageUrl: {
      type: String,
      trim: true,
      default: null,
      maxlength: 2048,
    },
  },
  { timestamps: true },
);

feedbackSchema.index({ building: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ user: 1, updatedAt: -1 });
feedbackSchema.index({ parkingSession: 1, user: 1 });

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
module.exports.FEEDBACK_STATUS = FEEDBACK_STATUS;
