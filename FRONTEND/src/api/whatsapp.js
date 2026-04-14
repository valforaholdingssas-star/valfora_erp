import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchWhatsAppAccounts = (params) => api.get("/whatsapp/accounts/", { params }).then(unwrap);
export const createWhatsAppAccount = (payload) => api.post("/whatsapp/accounts/", payload).then(unwrap);
export const updateWhatsAppAccount = (id, payload) => api.patch(`/whatsapp/accounts/${id}/`, payload).then(unwrap);
export const verifyWhatsAppAccount = (id) => api.post(`/whatsapp/accounts/${id}/verify/`).then(unwrap);
export const syncAccountPhoneNumbers = (id) => api.post(`/whatsapp/accounts/${id}/phone-numbers/sync/`).then(unwrap);
export const fetchAccountPhoneNumbers = (id) => api.get(`/whatsapp/accounts/${id}/phone-numbers/`).then(unwrap);

export const fetchWhatsAppPhoneNumbers = (params) => api.get("/whatsapp/phone-numbers/", { params }).then(unwrap);
export const updateWhatsAppPhoneNumber = (id, payload) => api.patch(`/whatsapp/phone-numbers/${id}/`, payload).then(unwrap);

export const fetchWhatsAppTemplates = (params) => api.get("/whatsapp/templates/", { params }).then(unwrap);
export const fetchApprovedTemplates = (params) => api.get("/whatsapp/templates/approved/", { params }).then(unwrap);
export const createWhatsAppTemplate = (payload) => api.post("/whatsapp/templates/", payload).then(unwrap);
export const updateWhatsAppTemplate = (id, payload) => api.patch(`/whatsapp/templates/${id}/`, payload).then(unwrap);
export const submitWhatsAppTemplate = (id) => api.post(`/whatsapp/templates/${id}/submit/`).then(unwrap);
export const syncWhatsAppTemplates = (payload) => api.post("/whatsapp/templates/sync/", payload).then(unwrap);

export const fetchWhatsAppProfile = () => api.get("/whatsapp/profile/").then(unwrap);
export const updateWhatsAppProfile = (payload) => api.patch("/whatsapp/profile/1/", payload).then(unwrap);

export const fetchWhatsAppAnalytics = () => api.get("/whatsapp/analytics/").then(unwrap);
