/* eslint-disable no-console */
const connectDB = require("../src/config/db");
const BuildingManager = require("../src/models/building/BuildingManager");
const Building = require("../src/models/building/Building");

async function reconcile() {
  await connectDB();

  console.log("Scanning BuildingManager documents for missing role...");
  const assignments = await BuildingManager.find().populate("building");
  let updated = 0;

  for (const a of assignments) {
    if (a.role) continue;

    let assignedRole = "staff";
    try {
      if (a.building && String(a.building.manager) === String(a.user)) {
        assignedRole = "manager";
      }
    } catch (e) {
      // ignore
    }

    a.role = assignedRole;
    await a.save();
    updated += 1;
    console.log("Updated assignment", a._id.toString(), "->", assignedRole);
  }

  console.log(`Done. Updated ${updated} documents.`);
  process.exit(0);
}

reconcile().catch((err) => {
  console.error("Migration error", err);
  process.exit(1);
});
