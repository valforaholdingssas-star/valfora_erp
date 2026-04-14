import { useCallback, useState } from "react";

import { fetchFinanceDashboard } from "../../../api/finance.js";

export const useFinanceDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async (params = {}) => {
    setLoading(true);
    setError("");
    try {
      const output = await fetchFinanceDashboard(params);
      setData(output);
    } catch {
      setError("No se pudo cargar dashboard financiero.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadDashboard };
};
