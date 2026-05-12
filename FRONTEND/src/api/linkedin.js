import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchLinkedInAccountStatus = () =>
  api.get("/linkedin/accounts/status/").then(unwrap);

export const connectLinkedInAccount = (payload) =>
  api.post("/linkedin/accounts/connect/", payload).then(unwrap);

export const disconnectLinkedInAccount = () =>
  api.post("/linkedin/accounts/disconnect/").then(unwrap);

export const fetchLinkedInDashboard = () =>
  api.get("/linkedin/dashboard/").then(unwrap);

export const fetchLinkedInSavedSearches = (params) =>
  api.get("/linkedin/searches/", { params }).then(unwrap);

export const createLinkedInSavedSearch = (payload) =>
  api.post("/linkedin/searches/", payload).then(unwrap);

export const updateLinkedInSavedSearch = (id, payload) =>
  api.patch(`/linkedin/searches/${id}/`, payload).then(unwrap);

export const deleteLinkedInSavedSearch = (id) =>
  api.delete(`/linkedin/searches/${id}/`).then(unwrap);

export const executeLinkedInSavedSearch = (id, payload) =>
  api.post(`/linkedin/searches/${id}/execute/`, payload || {}).then(unwrap);

export const fetchLinkedInProspects = (params) =>
  api.get("/linkedin/prospects/", { params }).then(unwrap);

export const fetchLinkedInProspect = (id) =>
  api.get(`/linkedin/prospects/${id}/`).then(unwrap);

export const createLinkedInProspect = (payload) =>
  api.post("/linkedin/prospects/", payload).then(unwrap);

export const updateLinkedInProspect = (id, payload) =>
  api.patch(`/linkedin/prospects/${id}/`, payload).then(unwrap);

export const linkLinkedInProspectToCrm = (id, payload) =>
  api.post(`/linkedin/prospects/${id}/link-crm/`, payload).then(unwrap);

export const moveLinkedInProspectStage = (id, payload) =>
  api.post(`/linkedin/prospects/${id}/move-stage/`, payload).then(unwrap);

export const inviteLinkedInProspect = (id, payload) =>
  api.post(`/linkedin/prospects/${id}/invite/`, payload || {}).then(unwrap);

export const withdrawLinkedInProspectInvite = (id, payload) =>
  api.post(`/linkedin/prospects/${id}/withdraw-invite/`, payload || {}).then(unwrap);

export const discardLinkedInProspect = (id) =>
  api.post(`/linkedin/prospects/${id}/discard/`).then(unwrap);

export const approveLinkedInProspect = (id) =>
  api.post(`/linkedin/prospects/${id}/approve/`).then(unwrap);

export const bulkApproveLinkedInProspects = (ids) =>
  api.post("/linkedin/prospects/bulk-approve/", { ids }).then(unwrap);

export const bulkDiscardLinkedInProspects = (ids) =>
  api.post("/linkedin/prospects/bulk-discard/", { ids }).then(unwrap);

export const fetchLinkedInPendingReview = (params) =>
  api.get("/linkedin/prospects/pending-review/", { params }).then(unwrap);

export const fetchLinkedInStaleProspects = (params) =>
  api.get("/linkedin/prospects/stale/", { params }).then(unwrap);

export const fetchLinkedInInvitationTemplates = (params) =>
  api.get("/linkedin/templates/invitations/", { params }).then(unwrap);

export const createLinkedInInvitationTemplate = (payload) =>
  api.post("/linkedin/templates/invitations/", payload).then(unwrap);

export const deleteLinkedInInvitationTemplate = (id) =>
  api.delete(`/linkedin/templates/invitations/${id}/`).then(unwrap);

export const fetchLinkedInMessageTemplates = (params) =>
  api.get("/linkedin/templates/messages/", { params }).then(unwrap);

export const createLinkedInMessageTemplate = (payload) =>
  api.post("/linkedin/templates/messages/", payload).then(unwrap);

export const deleteLinkedInMessageTemplate = (id) =>
  api.delete(`/linkedin/templates/messages/${id}/`).then(unwrap);

export const fetchLinkedInMessageConversations = () =>
  api.get("/linkedin/messages/conversations/").then(unwrap);

export const fetchLinkedInMessageConversationDetail = (prospectId, params) =>
  api.get(`/linkedin/messages/conversations/${prospectId}/`, { params }).then(unwrap);

export const sendLinkedInMessage = (prospectId, payload) =>
  api.post(`/linkedin/messages/conversations/${prospectId}/send/`, payload).then(unwrap);

export const startLinkedInMessage = (prospectId, payload) =>
  api.post(`/linkedin/messages/conversations/${prospectId}/start/`, payload).then(unwrap);

export const markLinkedInConversationRead = (prospectId) =>
  api.post(`/linkedin/messages/mark-read/${prospectId}/`).then(unwrap);

export const fetchLinkedInUnreadCount = () =>
  api.get("/linkedin/messages/unread-count/").then(unwrap);

export const fetchLinkedInInvitations = (params) =>
  api.get("/linkedin/invitations/", { params }).then(unwrap);

export const fetchLinkedInInvitationStats = () =>
  api.get("/linkedin/invitations/stats/").then(unwrap);

export const fetchLinkedInFunnelSummary = () =>
  api.get("/linkedin/funnel/summary/").then(unwrap);

export const fetchLinkedInFunnelStage = (stage, params) =>
  api.get(`/linkedin/funnel/stages/${stage}/`, { params }).then(unwrap);

export const updateLinkedInInvitationTemplate = (id, payload) =>
  api.patch(`/linkedin/templates/invitations/${id}/`, payload).then(unwrap);

export const updateLinkedInMessageTemplate = (id, payload) =>
  api.patch(`/linkedin/templates/messages/${id}/`, payload).then(unwrap);
