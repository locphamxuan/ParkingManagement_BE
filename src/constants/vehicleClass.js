/**
 * Canonical vehicle classes — the ONE mapping shared by:
 *  - `User.licensePlates[].vehicleType` (what the customer registered), and
 *  - `VehicleType.vehicleClass` (what a building's vehicle type actually is).
 *
 * Long-term package eligibility compares these two values EXACTLY. Compatibility
 * must never be inferred from display names, translated labels, or regexes — a
 * building whose VehicleType has no `vehicleClass` is "unmapped" and blocks
 * purchase until a manager sets it (never guessed at runtime).
 */
const VEHICLE_CLASSES = [
  'motorcycle',
  'ebike',
  'emotorbike',
  'car',
  'suv',
  'truck',
  'other',
];

// Slot/zone physical grouping only (a motorbike bay cannot hold a truck). This is
// NOT used for purchase eligibility — see `isPlateClassEligible` below.
const MOTORCYCLE_CLASSES = ['motorcycle', 'ebike', 'emotorbike'];

const isVehicleClass = (value) => VEHICLE_CLASSES.includes(`${value || ''}`.toLowerCase());

const normalizeVehicleClass = (value) => {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return isVehicleClass(normalized) ? normalized : null;
};

/** Physical group of a canonical class — used for slot/zone fit, not entitlement. */
const vehicleGroupOfClass = (value) => {
  const normalized = normalizeVehicleClass(value);
  if (!normalized) return null;
  return MOTORCYCLE_CLASSES.includes(normalized) ? 'motorcycle' : 'car';
};

/**
 * Purchase eligibility: a registered plate may buy a package only when its class
 * is exactly the class the package's VehicleType is mapped to. Returns false for
 * an unmapped vehicle type so the caller can raise a manager-correction error.
 */
const isPlateClassEligible = (plateClass, packageVehicleClass) => {
  const plate = normalizeVehicleClass(plateClass);
  const target = normalizeVehicleClass(packageVehicleClass);
  return Boolean(plate && target && plate === target);
};

module.exports = {
  VEHICLE_CLASSES,
  MOTORCYCLE_CLASSES,
  isVehicleClass,
  normalizeVehicleClass,
  vehicleGroupOfClass,
  isPlateClassEligible,
};
