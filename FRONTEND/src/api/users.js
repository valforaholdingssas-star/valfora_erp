import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchUsers = (params) => api.get("/users/", { params }).then(unwrap);

export const createUser = (payload) => api.post("/users/", payload).then(unwrap);

export const updateUser = (id, payload) => api.patch(`/users/${id}/`, payload).then(unwrap);

export const fetchRoles = (params) => api.get("/roles/", { params }).then(unwrap);

export const fetchPermissionMatrix = () => api.get("/rbac/role-matrix/").then(unwrap);

export const updatePermissionMatrix = (payload) => api.patch("/rbac/role-matrix/", payload).then(unwrap);
