import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  (import.meta.env.DEV ? "/api/v1" : "/api/v1");

const api = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("seeds_access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Let the browser set multipart boundaries for file uploads.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    delete config.headers["Content-Type"];
    delete config.headers["content-type"];
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("seeds_refresh_token");
      if (refresh) {
        try {
          const { data: body } = await axios.post(`${baseURL}/auth/refresh/`, {
            refresh,
          });
          const inner = body.data ?? body;
          const access = inner.access;
          if (access) {
            localStorage.setItem("seeds_access_token", access);
            original.headers.Authorization = `Bearer ${access}`;
            return api(original);
          }
        } catch {
          localStorage.removeItem("seeds_access_token");
          localStorage.removeItem("seeds_refresh_token");
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
