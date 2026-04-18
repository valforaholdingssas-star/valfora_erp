import api from "./axiosConfig.js";

export const fetchActivityLogs = (params) => api.get("/activity-logs/", { params }).then((r) => r.data);
