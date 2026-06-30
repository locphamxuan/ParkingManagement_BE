const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/reservation.service');
const { calculateReservationFee } = require('../../utils/feeEngine');
const ReservationPolicy = require('../../models/policy/ReservationPolicy');
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
  const { reservation, refund, amountPaid, refundPercent } = await service.cancel(req.user._id, req.params.id);
  sendSuccess(res, {
    message: `Đã hủy đặt chỗ. Hoàn ${refundPercent ?? 0}% tiền cọc.`,
    data: { reservation, refund, amountPaid, refundPercent: refundPercent ?? 0 },
  });
});

// GET /users/reservations/estimate?buildingId=&vehicleTypeId=&startTime=&endTime=
const estimate = asyncHandler(async (req, res) => {
  const { buildingId, vehicleTypeId, startTime, endTime } = req.query;
  if (!buildingId || !vehicleTypeId || !startTime || !endTime) {
    throw new AppError('buildingId, vehicleTypeId, startTime, endTime are required', 400);
  }
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);
  if (endDate <= startDate) {
    throw new AppError('endTime must be after startTime', 400);
  }
  // Chỉ cho phép ước tính theo giờ nguyên (1, 2, 3... giờ).
  service.assertWholeHourDuration(startDate, endDate);
  const { estimatedFee, hourlyRate, hours, regularHours, peakHours, peakRate } =
    await calculateReservationFee(buildingId, vehicleTypeId, startDate, endDate);
  // % cọc theo chính sách của tòa nhà (mặc định 15%). Phần còn lại thu sau checkout.
  const policy = await ReservationPolicy.findOne({ building: buildingId });
  const depositPercent = Math.min(Math.max(Number(policy?.depositPercent ?? 15), 0), 100);
  const depositAmount = Math.ceil((estimatedFee * depositPercent) / 100);
  sendSuccess(res, {
    data: {
      estimatedFee,
      depositAmount,
      remainingFee: estimatedFee - depositAmount,
      depositPercent,
      remainingPercent: 100 - depositPercent,
      hourlyRate, hours, regularHours, peakHours, peakRate,
    },
  });
});

module.exports = { list, get, create, cancel, estimate };
