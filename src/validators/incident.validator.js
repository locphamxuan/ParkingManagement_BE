const AppError = require('../utils/AppError');

const wrap = (fn) => (req, _res, next) => {
  try {
    fn(req);
    next();
  } catch (err) {
    next(err);
  }
};

const INCIDENT_STATUSES = ['open', 'investigating', 'escalated', 'penalty_pending', 'resolved', 'closed'];
const INCIDENT_ACTIONS = ['penalize_violator'];

/**
 * Validator dùng chung cho PATCH /staff/incidents/:id và
 * PATCH /manager/buildings/:buildingId/incidents/:id (cả 2 gọi chung
 * `applyIncidentAction`). Chỉ shape-check payload — role gate cho
 * `action:'penalize_violator'` nằm trong service (cần biết incident.status).
 *
 * Không nhận `paymentMethod` ở đây — manager chỉ DUYỆT số tiền phạt
 * (`penaltyFee`), phương thức thanh toán THỰC TẾ do staff/khách chọn lúc
 * check-out xe vi phạm (xem `settlePendingPenaltyAtCheckout`).
 */
const validateResolveIncident = wrap((req) => {
  const { status, resolutionNote, violatorPlate, action, penaltyFee } = req.body;

  if (status !== undefined && !INCIDENT_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${INCIDENT_STATUSES.join(', ')}`, 400, 'INVALID_STATUS');
  }
  if (resolutionNote !== undefined && String(resolutionNote).length > 1000) {
    throw new AppError('resolutionNote must be at most 1000 characters', 400);
  }
  if (violatorPlate !== undefined && String(violatorPlate).length > 20) {
    throw new AppError('violatorPlate must be at most 20 characters', 400);
  }
  if (action !== undefined && !INCIDENT_ACTIONS.includes(action)) {
    throw new AppError(`action must be one of: ${INCIDENT_ACTIONS.join(', ')}`, 400, 'INVALID_ACTION');
  }
  if (penaltyFee !== undefined) {
    const fee = Number(penaltyFee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new AppError('penaltyFee must be a non-negative number', 400, 'INVALID_PENALTY_FEE');
    }
  }
});

module.exports = { validateResolveIncident };
