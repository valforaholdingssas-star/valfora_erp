import { useCallback, useState } from "react";

import { fetchContracts } from "../../../api/finance.js";

export const useContracts = () => {
  const [data, setData] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadContracts = useCallback(async (params = {}) => {
    setLoading(true);
    setError("");
    try {
      const output = await fetchContracts(params);
      setData(output);
    } catch {
      setError("No se pudo cargar contratos.");
      setData({ results: [], count: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadContracts };
};
