/**
 * parkingSession.service.js — barrel.
 * Service đã được tách theo trách nhiệm để dễ bảo trì (trước đây ~1072 dòng):
 *  - parkingSession/checkIn.service     : checkIn
 *  - parkingSession/checkOut.service    : checkOut
 *  - parkingSession/query.service       : listActive / getById / search / lookupPlate / scanVehicle / rejectEntry
 *  - parkingSession/payment.service     : initiatePayment / settleSessionPayment / verifySessionPayment
 *  - parkingSession/helpers             : resolvers + tính phí dùng chung
 * Public API giữ nguyên nên các controller / webhook không phải đổi import.
 */
const { checkIn } = require('./parkingSession/checkIn.service');
const { checkOut } = require('./parkingSession/checkOut.service');
const query = require('./parkingSession/query.service');
const payment = require('./parkingSession/payment.service');

module.exports = {
  checkIn,
  checkOut,
  listActive: query.listActive,
  getById: query.getById,
  search: query.search,
  lookupPlate: query.lookupPlate,
  listFreeSlots: query.listFreeSlots,
  scanVehicle: query.scanVehicle,
  rejectEntry: query.rejectEntry,
  getMyShiftRevenue: query.getMyShiftRevenue,
  listMyCheckIns: query.listMyCheckIns,
  initiatePayment: payment.initiatePayment,
  settleSessionPayment: payment.settleSessionPayment,
  verifySessionPayment: payment.verifySessionPayment,
};
