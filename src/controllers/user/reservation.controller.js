const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const service = require('../../services/user/reservation.service');
const { calculateReservationFee } = require('../../utils/feeEngine');
const ReservationPolicy = require('../../models/policy/ReservationPolicy');
const AppError = require('../../utils/AppError');
const { clampPercent, DEFAULT_REFUND_PERCENT } = require('../../utils/reservationHold');

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

// GET /users/reservations/policy?buildingId= — giới hạn đặt chỗ công khai (không nhạy cảm)
// để FE ràng buộc date/duration picker TRƯỚC khi user chọn giờ cụ thể (estimate cần
// startTime/endTime nên không dùng được cho việc này).
const getPolicy = asyncHandler(async (req, res) => {
  const { buildingId } = req.query;
  if (!buildingId) throw new AppError('buildingId is required', 400);
  // KHÔNG lọc isActive: luồng hủy/hoàn tiền đọc policy bất kể isActive (đặt chỗ đang có
  // vẫn được honor khi tòa tắt nhận đặt mới) — lọc ở đây sẽ hiển thị % sai với thực hoàn.
  // isActive trả kèm để client biết tòa có đang nhận đặt chỗ mới hay không.
  const policy = await ReservationPolicy.findOne({ building: buildingId });
  sendSuccess(res, {
    data: {
      maxAdvanceDays: policy?.maxAdvanceDays ?? 7,
      maxDurationHours: policy?.maxDurationHours ?? 24,
      depositPercent: policy?.depositPercent ?? 15,
      refundPercent: clampPercent(policy?.refundPercent, DEFAULT_REFUND_PERCENT),
      cancellationCutoffHours: policy?.cancellationCutoffHours ?? 0,
      isActive: policy?.isActive ?? true,
    },
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

module.exports = { list, get, create, cancel, estimate, getPolicy };
