const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/reservation.service');
const calculateReservationFee = require('../../utils/calculateReservationFee');
const AppError = require('../../utils/AppError');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user._id, req.query);
  sendSuccess(res, { data });
});

const get = asyncHandler(async (req, res) => {
  const reservation = await service.get(req.user._id, req.params.id);
  sendSuccess(res, { data: { reservation } });
});

const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.user._id, req.body);
  // result: { reservation, paymentRequired?, fee?, checkoutUrl?, orderCode? }
  sendSuccess(res, { statusCode: 201, message: 'Reservation created', data: result });
});

const cancel = asyncHandler(async (req, res) => {
  const { reservation, refund, amountPaid } = await service.cancel(req.user._id, req.params.id);
  sendSuccess(res, {
    message: 'Reservation cancelled. Deposit is non-refundable.',
    data: { reservation, refund, amountPaid },
  });
});

// GET /users/reservations/estimate?buildingId=&vehicleTypeId=&startTime=&endTime=
const estimate = asyncHandler(async (req, res) => {
  const { buildingId, vehicleTypeId, startTime, endTime } = req.query;
  if (!buildingId || !vehicleTypeId || !startTime || !endTime) {
    throw new AppError('buildingId, vehicleTypeId, startTime, endTime are required', 400);
  }
  const { estimatedFee, hourlyRate, hours, regularHours, peakHours, peakRate } =
    await calculateReservationFee(buildingId, vehicleTypeId, new Date(startTime), new Date(endTime));
  const depositAmount = Math.ceil(estimatedFee * 0.15);
  sendSuccess(res, {
    data: {
      estimatedFee, depositAmount, remainingFee: estimatedFee - depositAmount,
      hourlyRate, hours, regularHours, peakHours, peakRate,
    },
  });
});

module.exports = { list, get, create, cancel, estimate };
