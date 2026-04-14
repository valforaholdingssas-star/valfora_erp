import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchCalendarEvents = (params) =>
  api.get("/calendar/events/", { params }).then(unwrap);
