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

let refreshPromise = null;

const refreshAccessToken = async () => {
  const refresh = localStorage.getItem("seeds_refresh_token");
  if (!refresh) {
    throw new Error("Missing refresh token");
  }
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh/`, { refresh })
      .then(({ data: body }) => {
        const inner = body.data ?? body;
        const access = inner.access;
        if (!access) {
          throw new Error("Invalid refresh response");
        }
        localStorage.setItem("seeds_access_token", access);
        // Backend rotates refresh tokens; persist the new one when present.
        if (inner.refresh) {
          localStorage.setItem("seeds_refresh_token", inner.refresh);
        }
        return access;
      })
      .catch((err) => {
        localStorage.removeItem("seeds_access_token");
        localStorage.removeItem("seeds_refresh_token");
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

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
      try {
        const access = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        // no-op: fall through to reject 401
      }
    }
    return Promise.reject(error);
  },
);

export default api;
