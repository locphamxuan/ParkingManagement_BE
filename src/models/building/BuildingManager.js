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

// role: explicit role of the assignment to avoid relying on User.role/Building.manager
buildingManagerSchema.add({
  role: {
    type: String,
    enum: ["manager", "staff"],
    required: true,
  },
});

// unique per (building, user)
buildingManagerSchema.index({ building: 1, user: 1 }, { unique: true });

// ensure only one active manager per building
buildingManagerSchema.index(
  { building: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: "manager", isActive: true },
  },
);

const BuildingManager = mongoose.model(
  "BuildingManager",
  buildingManagerSchema,
);

module.exports = BuildingManager;
