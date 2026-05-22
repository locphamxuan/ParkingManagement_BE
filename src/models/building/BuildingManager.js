const mongoose = require("mongoose");

const buildingManagerSchema = new mongoose.Schema(
  {
    building: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Building",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: () => new Date(),
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

buildingManagerSchema.index({ building: 1, user: 1 }, { unique: true });

const BuildingManager = mongoose.model(
  "BuildingManager",
  buildingManagerSchema,
);

module.exports = BuildingManager;
