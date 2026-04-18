import api from "./axiosConfig.js";

const unwrap = (res) => {
  const body = res.data;
  if (body && body.data !== undefined) return body.data;
  return body;
};

export const fetchActivityLogs = (params) => api.get("/activity-logs/", { params }).then(unwrap);
