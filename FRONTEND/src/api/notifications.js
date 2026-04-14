import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchNotifications = (params) =>
  api.get("/notifications/", { params }).then(unwrap);

export const markNotificationRead = (id) =>
  api.post(`/notifications/${id}/mark-read/`).then(unwrap);

export const markAllNotificationsRead = () =>
  api.post("/notifications/mark-all-read/").then(unwrap);

export function getUserNotifyWebSocketUrl(token) {
  const fromEnv = import.meta.env.VITE_WS_URL?.replace(/\/$/, "");
  const base =
    fromEnv ||
    (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://127.0.0.1:8000");
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const path = base.endsWith("/ws") ? "/user/" : "/ws/user/";
  return `${base}${path}${q}`;
}
