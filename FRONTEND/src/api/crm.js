import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchCrmDashboard = () => api.get("/crm/dashboard/").then(unwrap);

export const fetchContacts = (params) => api.get("/crm/contacts/", { params }).then(unwrap);

export const bulkAssignContacts = (payload) =>
  api.post("/crm/contacts/bulk-assign/", payload).then(unwrap);

export const bulkStageContacts = (payload) =>
  api.post("/crm/contacts/bulk-stage/", payload).then(unwrap);

export const fetchUsers = (params) => api.get("/users/", { params }).then(unwrap);

export const fetchContact = (id) => api.get(`/crm/contacts/${id}/`).then(unwrap);

export const createContact = (payload) => api.post("/crm/contacts/", payload).then(unwrap);

export const updateContact = (id, payload) => api.patch(`/crm/contacts/${id}/`, payload).then(unwrap);

export const deleteContact = (id) => api.delete(`/crm/contacts/${id}/`);

export const fetchContactTimeline = (id) =>
  api.get(`/crm/contacts/${id}/timeline/`).then(unwrap);

export const fetchContactChatHistory = (id, params) =>
  api.get(`/crm/contacts/${id}/chat-history/`, { params }).then(unwrap);

export const fetchCompanies = (params) => api.get("/crm/companies/", { params }).then(unwrap);

export const createCompany = (payload) => api.post("/crm/companies/", payload).then(unwrap);

export const fetchCompany = (id) => api.get(`/crm/companies/${id}/`).then(unwrap);

export const updateCompany = (id, payload) => api.patch(`/crm/companies/${id}/`, payload).then(unwrap);

export const deleteCompany = (id) => api.delete(`/crm/companies/${id}/`);

export const fetchDeals = (params) => api.get("/crm/deals/", { params }).then(unwrap);
export const fetchDeal = (id) => api.get(`/crm/deals/${id}/`).then(unwrap);

export const createDeal = (payload) => api.post("/crm/deals/", payload).then(unwrap);

export const updateDeal = (id, payload) => api.patch(`/crm/deals/${id}/`, payload).then(unwrap);
export const moveDealStage = (id, payload) => api.post(`/crm/deals/${id}/move-stage/`, payload).then(unwrap);
export const fetchDealStageHistory = (id) => api.get(`/crm/deals/${id}/stage-history/`).then(unwrap);

export const fetchActivities = (params) => api.get("/crm/activities/", { params }).then(unwrap);

export const createActivity = (payload) => api.post("/crm/activities/", payload).then(unwrap);

export const updateActivity = (id, payload) => api.patch(`/crm/activities/${id}/`, payload).then(unwrap);

export const completeActivity = (id) =>
  api.post(`/crm/activities/${id}/complete/`).then(unwrap);

export const fetchDocuments = (params) => api.get("/crm/documents/", { params }).then(unwrap);

export const uploadDocument = (formData) =>
  api.post("/crm/documents/", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(unwrap);

export const bulkReactivateContacts = (payload) =>
  api.post("/crm/contacts/bulk-reactivate/", payload).then(unwrap);
