/**
 * parkingSession.service.js — barrel.
 * Service đã được tách theo trách nhiệm để dễ bảo trì (trước đây ~1072 dòng):
 *  - parkingSession/checkInOut.service  : checkIn / checkOut
 *  - parkingSession/query.service       : listActive / getById / search / lookupPlate / scanVehicle / rejectEntry
 *  - parkingSession/payment.service     : initiatePayment / settleSessionPayment / verifySessionPayment
 *  - parkingSession/helpers             : resolvers + tính phí dùng chung
 * Public API giữ nguyên nên các controller / webhook không phải đổi import.
 */
const checkInOut = require('./parkingSession/checkInOut.service');
const query = require('./parkingSession/query.service');
const payment = require('./parkingSession/payment.service');

module.exports = {
  checkIn: checkInOut.checkIn,
  checkOut: checkInOut.checkOut,
  listActive: query.listActive,
  getById: query.getById,
  search: query.search,
  lookupPlate: query.lookupPlate,
  scanVehicle: query.scanVehicle,
  rejectEntry: query.rejectEntry,
  initiatePayment: payment.initiatePayment,
  settleSessionPayment: payment.settleSessionPayment,
  verifySessionPayment: payment.verifySessionPayment,
};
