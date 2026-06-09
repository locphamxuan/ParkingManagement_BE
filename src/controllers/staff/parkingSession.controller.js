const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const parkingSessionService = require('../../services/staff/parkingSession.service');

const checkIn = asyncHandler(async (req, res) => {
  const payload = req.body;
  const session = await parkingSessionService.checkIn(req.user, payload);
  sendSuccess(res, { data: session });
});

const checkOut = asyncHandler(async (req, res) => {
  const session = await parkingSessionService.checkOut(req.user, req.params.id, req.body);
  sendSuccess(res, { data: session });
});

const listActive = asyncHandler(async (req, res) => {
  const items = await parkingSessionService.listActive(req.user, req.query);
  sendSuccess(res, { data: { items } });
});

const getById = asyncHandler(async (req, res) => {
  const session = await parkingSessionService.getById(req.user, req.params.id);
  sendSuccess(res, { data: session });
});

const search = asyncHandler(async (req, res) => {
  const items = await parkingSessionService.search(req.user, req.query.plate, req.query);
  sendSuccess(res, { data: { items } });
});

/**
 * GET /api/staff/parking-sessions/lookup-plate/:plate
 * Returns whether the plate belongs to a registered user, with wallet info.
 */
const lookupPlate = asyncHandler(async (req, res) => {
  const data = await parkingSessionService.lookupPlate(req.user, req.params.plate);
  sendSuccess(res, { data });
});

/**
 * POST /api/staff/parking-sessions/scan
 * AI camera (Camera 1): reads plate + brand from a captured frame and resolves
 * the owner account by plate. Body: { image } (base64, data-URL prefix allowed).
 */
const scan = asyncHandler(async (req, res) => {
  const data = await parkingSessionService.scanVehicle(req.user, req.body?.image);
  sendSuccess(res, { data });
});

/**
 * POST /api/staff/parking-sessions/reject
 * Staff từ chối check-in/out; gửi thông báo cho chủ biển số.
 * Body: { plateNumber, stage: 'check-in'|'check-out', reason, building? }
 */
const reject = asyncHandler(async (req, res) => {
  const data = await parkingSessionService.rejectEntry(req.user, req.body);
  sendSuccess(res, { message: 'Đã từ chối và gửi thông báo cho khách (nếu có tài khoản).', data });
});

/**
 * POST /api/staff/parking-sessions/:id/initiate-payment
 * Tạo PayOS payment link (QR + checkoutUrl) để thu phí gửi xe.
 * Staff hiển thị QR cho khách quét bằng app ngân hàng.
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const data = await parkingSessionService.initiatePayment(req.user, req.params.id);
  sendSuccess(res, { message: 'PayOS payment link created', data });
});

/**
 * GET /api/staff/parking-sessions/payment/:orderCode/status
 * Reconcile a bank-transfer (PayOS) session payment — fallback when the webhook
 * did not arrive. Completes the session + credits the manager wallet if PAID.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const data = await parkingSessionService.verifySessionPayment(req.user, req.params.orderCode);
  sendSuccess(res, { data });
});

module.exports = { checkIn, checkOut, listActive, getById, search, lookupPlate, scan, reject, initiatePayment, verifyPayment };
