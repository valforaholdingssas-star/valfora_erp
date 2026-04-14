import api from "./axiosConfig.js";

const unwrap = (res) => {
  const b = res.data;
  if (b && b.data !== undefined) return b.data;
  return b;
};

export const fetchContracts = (params) => api.get("/finance/contracts/", { params }).then(unwrap);
export const fetchContract = (id) => api.get(`/finance/contracts/${id}/`).then(unwrap);
export const createContract = (payload) => api.post("/finance/contracts/", payload).then(unwrap);
export const updateContract = (id, payload) => api.patch(`/finance/contracts/${id}/`, payload).then(unwrap);

export const fetchInvoices = (params) => api.get("/finance/invoices/", { params }).then(unwrap);
export const fetchInvoice = (id) => api.get(`/finance/invoices/${id}/`).then(unwrap);
export const createInvoice = (payload) => api.post("/finance/invoices/", payload).then(unwrap);
export const updateInvoice = (id, payload) => api.patch(`/finance/invoices/${id}/`, payload).then(unwrap);

export const fetchPayments = (params) => api.get("/finance/payments/", { params }).then(unwrap);
export const createPayment = (payload) => api.post("/finance/payments/", payload).then(unwrap);

export const fetchReceivables = (params) => api.get("/finance/receivables/", { params }).then(unwrap);
export const fetchAgingReport = () => api.get("/finance/receivables/aging-report/").then(unwrap);
export const fetchFinanceDashboard = (params) => api.get("/finance/dashboard/", { params }).then(unwrap);
