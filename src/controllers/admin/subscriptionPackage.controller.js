const subscriptionPackageService = require('../../services/admin/subscriptionPackage.service');

const listPackages = async (req, res, next) => {
  try {
    const items = await subscriptionPackageService.list(req.query);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
};

const getPackage = async (req, res, next) => {
  try {
    const pkg = await subscriptionPackageService.getById(req.params.id);
    res.json({ success: true, data: pkg });
  } catch (err) {
    next(err);
  }
};

const createPackage = async (req, res, next) => {
  try {
    const pkg = await subscriptionPackageService.create(req.body);
    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    next(err);
  }
};

const updatePackage = async (req, res, next) => {
  try {
    const pkg = await subscriptionPackageService.update(req.params.id, req.body);
    res.json({ success: true, data: pkg });
  } catch (err) {
    next(err);
  }
};

const deletePackage = async (req, res, next) => {
  try {
    await subscriptionPackageService.remove(req.params.id);
    res.json({ success: true, message: 'Package deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listPackages, getPackage, createPackage, updatePackage, deletePackage };
