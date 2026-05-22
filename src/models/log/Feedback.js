const mongoose = require("mongoose");

const FEEDBACK_STATUS = ["open", "in_progress", "resolved", "closed"];

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    rating: { type: Number, min: 1, max: 5, default: null },
    subject: {
      type: String,
      required: [true, "subject is required"],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, "content is required"],
      trim: true,
      maxlength: 2000,
    },
    response: { type: String, trim: true, maxlength: 2000, default: "" },
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    respondedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: FEEDBACK_STATUS,
      default: "open",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
module.exports.FEEDBACK_STATUS = FEEDBACK_STATUS;
