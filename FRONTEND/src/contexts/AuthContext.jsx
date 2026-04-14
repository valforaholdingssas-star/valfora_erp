import PropTypes from "prop-types";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import api from "../api/axiosConfig.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem("seeds_access_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: body } = await api.get("/auth/me/");
      const payload = body.data !== undefined ? body.data : body;
      setUser(payload);
    } catch {
      setUser(null);
      localStorage.removeItem("seeds_access_token");
      localStorage.removeItem("seeds_refresh_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = useCallback(async (email, password) => {
    const { data: body } = await api.post("/auth/login/", { email, password });
    const inner = body.data ?? body;
    const access = inner.access;
    const refresh = inner.refresh;
    if (!access || !refresh) {
      throw new Error("Respuesta de login inválida");
    }
    localStorage.setItem("seeds_access_token", access);
    localStorage.setItem("seeds_refresh_token", refresh);
    await loadProfile();
  }, [loadProfile]);

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem("seeds_refresh_token");
    try {
      if (refresh) {
        await api.post("/auth/logout/", { refresh });
      }
    } catch {
      /* ignore */
    }
    localStorage.removeItem("seeds_access_token");
    localStorage.removeItem("seeds_refresh_token");
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      hasModuleAccess: (module, action = "view") =>
        Boolean(user?.module_permissions?.[module]?.[action]),
      login,
      logout,
      loadProfile,
    }),
    [user, loading, login, logout, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
};
