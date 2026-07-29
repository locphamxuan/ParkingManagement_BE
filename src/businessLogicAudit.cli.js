const mongoose = require('mongoose');
const connectDB = require('./config/db');
const {
  auditBusinessLogicInvariants,
  applyUniqueIndexes,
} = require('./services/shared/businessLogicAudit.service');

const applyIndexes = process.argv.includes('--apply-indexes');
const unsupportedWriteFlag = process.argv.some(
  (argument) => argument.startsWith('--apply') && argument !== '--apply-indexes',
);

const main = async () => {
  if (unsupportedWriteFlag) {
    throw new Error('Unsupported write mode. Use --apply-indexes after resolving audit conflicts.');
  }

  // Loading the models must never build schema-declared indexes on the target
  // cluster — a dry-run has to be strictly read-only. --apply-indexes creates its
  // indexes explicitly via collection.createIndex, so it is unaffected.
  mongoose.set('autoIndex', false);
  await connectDB();
  const report = await auditBusinessLogicInvariants();
  const output = { ...report, mode: applyIndexes ? 'apply-indexes' : 'dry-run' };

  if (applyIndexes) {
    output.createdIndexes = await applyUniqueIndexes(report);
    output.rollback = [
      'db.longtermsubscriptions.dropIndex("uniq_active_fixed_slot")',
      'db.payments.dropIndex("uniq_payos_order_code")',
      'db.payments.dropIndex("uniq_pending_payos_session")',
      'db.payments.dropIndex("uniq_live_payos_session_intent")',
      'db.parkingsessions.dropIndex("uniq_active_session_per_plate_building")',
      'db.feedbacks.dropIndex("uniq_feedback_per_user_session")',
      'db.users.dropIndex("uniq_license_plate_owner")',
    ];
  } else {
    output.nextStep = 'Resolve every conflict, then rerun with --apply-indexes.';
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
