/**
 * Repairs active long-term subscriptions whose owner relationship is broken.
 *
 * - If the owner exists but their plate is missing, restore that plate only
 *   when no other account owns it.
 * - If the owner account no longer exists, cancel the orphaned entitlement
 *   without a refund (there is no payable account), preserving the complete
 *   financial/subscription history for audit.
 *
 * Usage:
 *   node src/scripts/repairActiveSubscriptionOwners.js          # preview
 *   node src/scripts/repairActiveSubscriptionOwners.js --apply  # repair
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { LongTermSubscription, ParkingSession, ParkingSlot, User } = require('../models');
const { generatePlateQrCode } = require('../models/user/User');
const { normalizePlate, plateMatchRegex } = require('../utils/plate.util');

const apply = process.argv.includes('--apply');

const plateKindFromPackage = (vehicleType) => {
  const label = `${vehicleType?.code || ''} ${vehicleType?.name || ''}`.toLowerCase();
  return /motor|bike|moto|xe m|mÃ¡y/.test(label) ? 'motorcycle' : 'car';
};

const userOwnsPlate = (user, plateNumber) =>
  (user.licensePlates || []).some((plate) => normalizePlate(plate.plateNumber) === plateNumber);

const main = async () => {
  await connectDB();
  const subscriptions = await LongTermSubscription.find({ status: 'active' })
    .populate({ path: 'package', select: 'vehicleType', populate: { path: 'vehicleType', select: 'code name' } })
    .lean();
  const report = { mode: apply ? 'apply' : 'dry-run', restoredPlates: [], cancelledOrphans: [], skipped: [] };

  for (const subscription of subscriptions) {
    const plateNumber = normalizePlate(subscription.plateNumber);
    const owner = await User.findById(subscription.user).select('licensePlates');

    if (!owner) {
      const hasActiveSession = await ParkingSession.exists({
        building: subscription.building,
        plateNumber: subscription.plateNumber,
        status: 'active',
      });
      if (hasActiveSession) {
        report.skipped.push({
          subscriptionId: `${subscription._id}`,
          plateNumber,
          reason: 'orphan_owner_has_active_parking_session',
        });
        continue;
      }
      report.cancelledOrphans.push({ subscriptionId: `${subscription._id}`, plateNumber, reason: 'owner_user_missing' });
      if (apply) {
        await LongTermSubscription.updateOne(
          { _id: subscription._id, status: 'active' },
          {
            $set: {
              status: 'cancelled',
              cancelReason: 'other',
              cancelNote: 'Data integrity repair: owner account no longer exists; entitlement revoked without refund.',
              refundPercent: 0,
              refundAmount: 0,
            },
          },
        );
        if (subscription.slot) {
          await ParkingSlot.updateOne(
            { _id: subscription.slot, status: 'reserved' },
            { $set: { status: 'available' } },
          );
        }
      }
      continue;
    }

    if (userOwnsPlate(owner, plateNumber)) continue;

    const otherOwner = await User.exists({
      _id: { $ne: owner._id },
      'licensePlates.plateNumber': plateMatchRegex(plateNumber) || plateNumber,
    });
    if (otherOwner) {
      report.skipped.push({ subscriptionId: `${subscription._id}`, plateNumber, reason: 'plate_owned_by_another_account' });
      continue;
    }

    const vehicleType = plateKindFromPackage(subscription.package?.vehicleType);
    report.restoredPlates.push({ subscriptionId: `${subscription._id}`, userId: `${owner._id}`, plateNumber, vehicleType });
    if (apply) {
      owner.licensePlates.push({ plateNumber, vehicleType, isDefault: false, qrCode: generatePlateQrCode() });
      await owner.save();
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
