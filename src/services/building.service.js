const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roles");
const buildingRepository = require("../repositories/building.repository");
const { Floor } = require("../models");

const buildListFilter = (query = {}) => {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === "true" || query.isActive === true;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { code: { $regex: search, $options: "i" } },
      { "address.fullAddress": { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

const parsePagination = (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 500);

  return { page, limit };
};

const getBuildingOrFail = async (id) => {
  const building = await buildingRepository.findById(id);
  if (!building) {
    throw new AppError("Building not found", 404);
  }
  return building;
};

const listBuildings = async (query = {}) => {
  const filter = buildListFilter(query);
  const { page, limit } = parsePagination(query);
  const [items, total] = await Promise.all([
    buildingRepository.list({ filter, page, limit }),
    buildingRepository.count(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const createBuilding = async (payload) => buildingRepository.create(payload);

const updateBuilding = async (id, payload) => {
  const updated = await buildingRepository.updateById(id, payload);
  if (!updated) {
    throw new AppError("Building not found", 404);
  }
  return updated;
};

const updateBuildingStatus = async (id, status) => {
  const updated = await buildingRepository.updateById(id, { status });
  if (!updated) {
    throw new AppError("Building not found", 404);
  }
  return updated;
};

const removeBuilding = async (id) => {
  const deleted = await buildingRepository.deleteById(id);
  if (!deleted) {
    throw new AppError("Building not found", 404);
  }
  return deleted;
};

// Số tầng THẬT của toà = đếm Floor đã tạo (qua trang Floor management), KHÔNG
// dùng field `totalFloors` tự nhập tay (dễ lệch — vd manager nhập 1 nhưng thực
// tế đã tạo 3 tầng). Trả kèm `floorCount` bên cạnh building doc để FE hiển thị.
const attachFloorCount = async (building) => {
  const obj = building.toObject ? building.toObject() : building;
  obj.floorCount = await Floor.countDocuments({ building: obj._id });
  return obj;
};

const getManagerBuilding = async (user, buildingId) => {
  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];

  if (buildingId) {
    const assignedIds = assignedBuildings.map(
      (building) => `${building._id || building}`,
    );
    if (!assignedIds.includes(`${buildingId}`)) {
      throw new AppError("Forbidden for this building", 403);
    }

    const building = await getBuildingOrFail(buildingId);
    return attachFloorCount(building);
  }

  if (assignedBuildings.length === 0) {
    throw new AppError("No building assiged", 404);
  }

  const assignedIds = assignedBuildings.map(
    (building) => building._id || building,
  );
  const buildings = await buildingRepository.list({
    filter: { _id: { $in: assignedIds } },
    page: 1,
    limit: 1000,
  });

  return Promise.all(buildings.map(attachFloorCount));
};

const updateManagerBuilding = async (user, buildingId, payload) => {
  // buildingId is required for update
  if (!buildingId) {
    throw new AppError("buildingId is required for update", 400);
  }

  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];
  const assignedIds = assignedBuildings.map(
    (building) => `${building._id || building}`,
  );
  if (!assignedIds.includes(`${buildingId}`)) {
    throw new AppError("Forbidden for this building", 403);
  }

  const building = await getBuildingOrFail(buildingId);

  // Only allow updates to active buildings
  if (building.status !== "active") {
    throw new AppError("Can only update buildings with status=active", 403);
  }

  // Manager chỉ sửa các trường cơ bản. Giá do tab "Giá" (PricePolicy) quản lý;
  // giờ hoạt động có tab riêng (updateManagerOperatingHours); số tầng do trang
  // Floor management quản lý (tạo/xoá Floor thật) — KHÔNG cho nhập tay ở đây,
  // tránh lệch với số tầng thực tế đã tạo (đã xảy ra trước đây).
  const ALLOWED_FIELDS = ["name", "status"];
  const safePayload = {};
  for (const key of ALLOWED_FIELDS) {
    if (payload[key] !== undefined) safePayload[key] = payload[key];
  }

  const updated = await updateBuilding(buildingId, safePayload);
  return attachFloorCount(updated);
};

// Validate "HH:MM" (24h) time strings used for operating hours.
const isValidTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value.trim());

/**
 * Manager cập nhật giờ mở/đóng cửa của tòa nhà (tab riêng "Giờ hoạt động").
 */
const updateManagerOperatingHours = async (user, buildingId, payload = {}) => {
  if (!buildingId) {
    throw new AppError("buildingId is required", 400);
  }

  const assignedBuildings = Array.isArray(user.assignedBuildings)
    ? user.assignedBuildings
    : [];
  const assignedIds = assignedBuildings.map(
    (building) => `${building._id || building}`,
  );
  if (!assignedIds.includes(`${buildingId}`)) {
    throw new AppError("Forbidden for this building", 403);
  }

  await getBuildingOrFail(buildingId);

  const open = `${payload.open || ""}`.trim();
  const close = `${payload.close || ""}`.trim();
  if (!isValidTime(open) || !isValidTime(close)) {
    throw new AppError("open/close phải có định dạng HH:MM (24h)", 400);
  }
  if (open === close) {
    throw new AppError("Giờ mở và giờ đóng không được trùng nhau", 400);
  }

  return updateBuilding(buildingId, { operatingHours: { open, close } });
};

module.exports = {
  listBuildings,
  getBuildingOrFail,
  createBuilding,
  updateBuilding,
  updateBuildingStatus,
  removeBuilding,
  getManagerBuilding,
  updateManagerBuilding,
  updateManagerOperatingHours,
};
