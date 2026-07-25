const AppError = require("../utils/AppError");
const { parseTime } = require("../utils/businessTime");
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

// Whitelist fields so clients can never mass-assign system-managed fields
// (manager, isActive, timestamps, ...) through the create/update payload.
const CREATABLE_FIELDS = [
  "name",
  "code",
  "address",
  "description",
  "totalFloors",
  "operatingHours",
  "pricing",
  "contactPhone",
  "images",
  "location",
];
const UPDATABLE_FIELDS = [...CREATABLE_FIELDS, "status"];

const pickFields = (payload = {}, fields) =>
  fields.reduce((acc, field) => {
    if (payload[field] !== undefined) acc[field] = payload[field];
    return acc;
  }, {});

const createBuilding = async (payload) =>
  buildingRepository.create(pickFields(payload, CREATABLE_FIELDS));

const updateBuilding = async (id, payload) => {
  const updated = await buildingRepository.updateById(
    id,
    pickFields(payload, UPDATABLE_FIELDS),
  );
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
  const obj = building.toObject?.() ?? building;
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

// Trạng thái manager được phép đọc/ghi trên tòa mình phụ trách.
const MANAGER_EDITABLE_STATUSES = ["active", "maintenance"];

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

  // Manager tự bật/tắt bảo trì cho tòa mình phụ trách, nên phải sửa được CẢ khi
  // đang 'maintenance' — nếu chỉ cho 'active' thì đặt bảo trì xong sẽ kẹt một
  // chiều, phải nhờ admin mở lại. 'inactive' là vòng đời của admin.
  if (!MANAGER_EDITABLE_STATUSES.includes(building.status)) {
    throw new AppError(
      `Can only update buildings with status=${MANAGER_EDITABLE_STATUSES.join(" or ")}`,
      403,
      "BUILDING_STATUS_FORBIDDEN",
    );
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

  // Chỉ cho manager chuyển giữa active ↔ maintenance; 'inactive' (ngừng khai
  // thác) vẫn là quyền admin, tránh manager tự đưa tòa vào trạng thái không tự
  // khôi phục được.
  if (
    safePayload.status !== undefined &&
    !MANAGER_EDITABLE_STATUSES.includes(safePayload.status)
  ) {
    throw new AppError(
      `Manager can only switch a building between ${MANAGER_EDITABLE_STATUSES.join(" and ")}`,
      403,
      "BUILDING_STATUS_FORBIDDEN",
    );
  }

  const updated = await updateBuilding(buildingId, safePayload);
  return attachFloorCount(updated);
};

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
  if (parseTime(open) === null || parseTime(close) === null || open === close) {
    throw new AppError(
      "open/close phải có định dạng HH:mm và không được trùng nhau",
      400,
      "INVALID_OPERATING_HOURS",
    );
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
