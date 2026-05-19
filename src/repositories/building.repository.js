const Building = require("../models/Building");

const list = ({
  filter = {},
  page = 1,
  limit = 10,
  sort = "-createdAt",
} = {}) =>
  Building.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit);

const count = (filter = {}) => Building.countDocuments(filter);

const findById = (id) => Building.findById(id);

const create = (payload) => Building.create(payload);

const updateById = (id, payload) =>
  Building.findByIdAndUpdate(id, payload, {
    new: true,
    runValidators: true,
  });

const deleteById = (id) => Building.findByIdAndDelete(id);

module.exports = {
  list,
  count,
  findById,
  create,
  updateById,
  deleteById,
};
