import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchWikiDocuments = (params) => api.get("/wiki/documents/", { params }).then(unwrap);
export const fetchWikiDocumentBySlug = (slug) => api.get(`/wiki/documents/by-slug/${slug}/`).then(unwrap);
export const createWikiDocument = (payload) => api.post("/wiki/documents/", payload).then(unwrap);
export const updateWikiDocument = (id, payload) => api.patch(`/wiki/documents/${id}/`, payload).then(unwrap);
export const deleteWikiDocument = (id) => api.delete(`/wiki/documents/${id}/`).then(unwrap);

