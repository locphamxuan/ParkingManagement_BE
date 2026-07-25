const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { reportStalePayosPayments } = require('./services/shared/stalePayosReport.service');

const FLAG = '--older-than-minutes=';

const parseThreshold = (argv) => {
  const raw = argv.find((argument) => argument.startsWith(FLAG));
  if (!raw) {
    throw new Error(`${FLAG}<positive integer> is required (no default SLA is assumed)`);
  }
  const value = Number(raw.slice(FLAG.length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${FLAG}<positive integer> must be a positive integer`);
  }
  return value;
};

const main = async () => {
  const olderThanMinutes = parseThreshold(process.argv.slice(2));

  // Read-only: loading the models must never build indexes on the target cluster.
  mongoose.set('autoIndex', false);
  await connectDB();

  const report = await reportStalePayosPayments({ olderThanMinutes });
  process.stdout.write(`${JSON.stringify({ ...report, mode: 'read-only' }, null, 2)}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });
