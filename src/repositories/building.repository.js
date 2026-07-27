const Building = require("../models/building/Building");

const list = ({
  filter = {},
  page = 1,
  limit = 10,
  sort = "-createdAt",
} = {}) =>
  Building.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("manager", "fullName email");

const count = (filter = {}) => Building.countDocuments(filter);

const findById = (id) => Building.findById(id).populate("manager", "fullName email");

const create = (payload) => Building.create(payload);

const updateById = (id, payload) =>
  Building.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

module.exports = {
  list,
  count,
  findById,
  create,
  updateById,
};

