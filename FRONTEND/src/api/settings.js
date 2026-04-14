import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchLeadEngineConfig = () => api.get("/settings/lead-engine/").then(unwrap);
export const updateLeadEngineConfig = (payload) => api.patch("/settings/lead-engine/", payload).then(unwrap);

export const fetchPipelineAutomationConfig = () => api.get("/settings/pipeline-automation/").then(unwrap);
export const updatePipelineAutomationConfig = (payload) =>
  api.patch("/settings/pipeline-automation/", payload).then(unwrap);

export const fetchLeadEngineDashboard = () => api.get("/settings/lead-engine/dashboard/").then(unwrap);
