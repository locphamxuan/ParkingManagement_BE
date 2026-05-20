// Quick integration check script
// - Stubs admin user.service.updateStatus
// - Calls admin controller updateStatus to exercise validator -> controller flow

const service = require('../src/services/admin/user.service');

// Stub the updateStatus to avoid DB
service.updateStatus = async (actor, id, isActive) => {
  return {
    _id: id,
    email: 'target@example.com',
    role: 'user',
    isActive: !!isActive,
  };
};

const controller = require('../src/controllers/admin/user.controller');

const req = {
  user: { _id: 'admin-actor', email: 'admin@example.com', role: 'admin' },
  params: { id: 'target-user-1' },
  body: { isActive: false },
};

const res = {
  _status: 200,
  status(code) {
    this._status = code;
    return this;
  },
  json(payload) {
    console.log('--- Controller Response ---');
    console.log(JSON.stringify({ status: this._status, body: payload }, null, 2));
    return payload;
  },
};

const next = (err) => {
  if (err) {
    console.error('--- next() error ---');
    console.error(err && err.message ? err.message : err);
  }
};

(async () => {
  try {
    await controller.updateStatus(req, res, next);
  } catch (err) {
    console.error('Unhandled error:', err);
  }
})();
