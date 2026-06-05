const AdminSubscriptionPackage = require('../../models/finance/AdminSubscriptionPackage');
const AppError = require('../../utils/AppError');

const list = async (query = {}) => {
  const filter = {};
  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true' || query.isActive === true;
  }
  return AdminSubscriptionPackage.find(filter).sort('-createdAt');
};

const getById = async (id) => {
  const pkg = await AdminSubscriptionPackage.findById(id);
  if (!pkg) throw new AppError('Subscription package not found', 404);
  return pkg;
};

const create = async (payload) => {
  const { name, price, durationDays, description, features } = payload;
  if (!name) throw new AppError('name is required', 400);
  if (!price || price <= 0) throw new AppError('price must be a positive number', 400);
  if (!durationDays || durationDays < 1) throw new AppError('durationDays must be >= 1', 400);

  return AdminSubscriptionPackage.create({
    name: String(name).trim(),
    price: Number(price),
    durationDays: Number(durationDays),
    description: description ? String(description).trim() : '',
    features: Array.isArray(features) ? features.map(String) : [],
    isActive: payload.isActive !== false,
  });
};

const update = async (id, payload) => {
  const pkg = await AdminSubscriptionPackage.findById(id);
  if (!pkg) throw new AppError('Subscription package not found', 404);

  const allowed = ['name', 'price', 'durationDays', 'description', 'features', 'isActive'];
  allowed.forEach((k) => {
    if (payload[k] !== undefined) pkg[k] = payload[k];
  });
  return pkg.save();
};

const remove = async (id) => {
  const pkg = await AdminSubscriptionPackage.findByIdAndDelete(id);
  if (!pkg) throw new AppError('Subscription package not found', 404);
  return pkg;
};

module.exports = { list, getById, create, update, remove };
