import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchConversations = (params) =>
  api.get("/chat/conversations/", { params }).then(unwrap);

export const patchConversation = (id, payload) =>
  api.patch(`/chat/conversations/${id}/`, payload).then(unwrap);

export const createOrOpenConversation = (payload) =>
  api.post("/chat/conversations/", payload).then(unwrap);

export const fetchMessages = (conversationId, params) =>
  api.get(`/chat/conversations/${conversationId}/messages/`, { params }).then(unwrap);

export const sendMessage = (conversationId, payload) =>
  api
    .post(`/chat/conversations/${conversationId}/messages/`, payload)
    .then(unwrap);

export const toggleAi = (conversationId) =>
  api.post(`/chat/conversations/${conversationId}/toggle-ai/`).then(unwrap);

export const markRead = (conversationId) =>
  api.post(`/chat/conversations/${conversationId}/mark-read/`).then(unwrap);

export const clearHandoff = (conversationId) =>
  api.post(`/chat/conversations/${conversationId}/clear-handoff/`).then(unwrap);

export const sendTemplateMessage = (conversationId, payload) =>
  api.post(`/chat/conversations/${conversationId}/send-template/`, payload).then(unwrap);

export function getChatWebSocketUrl(conversationId, token) {
  const fromEnv = import.meta.env.VITE_WS_URL?.replace(/\/$/, "");
  const base =
    fromEnv ||
    (typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://127.0.0.1:8000");
  const q = token ? `?token=${encodeURIComponent(token)}` : "";
  const path = base.endsWith("/ws")
    ? `/chat/${conversationId}/`
    : `/ws/chat/${conversationId}/`;
  return `${base}${path}${q}`;
}
