import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchAiConfigurations = (params) =>
  api.get("/ai-config/configurations/", { params }).then(unwrap);

export const createAiConfiguration = (payload) =>
  api.post("/ai-config/configurations/", payload).then(unwrap);

export const patchAiConfiguration = (id, payload) =>
  api.patch(`/ai-config/configurations/${id}/`, payload).then(unwrap);

export const deleteAiConfiguration = (id) => api.delete(`/ai-config/configurations/${id}/`).then(unwrap);

export const testAiConfiguration = (id, payload) =>
  api.post(`/ai-config/configurations/${id}/test/`, payload).then(unwrap);

export const fetchAiRuntimeSettings = () =>
  api.get("/ai-config/runtime-settings/current/").then(unwrap);

export const patchAiRuntimeSettings = (payload) =>
  api.patch("/ai-config/runtime-settings/current/", payload).then(unwrap);
