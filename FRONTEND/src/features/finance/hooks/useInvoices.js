import { useCallback, useState } from "react";

import { fetchInvoices } from "../../../api/finance.js";

export const useInvoices = () => {
  const [data, setData] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadInvoices = useCallback(async (params = {}) => {
    setLoading(true);
    setError("");
    try {
      const output = await fetchInvoices(params);
      setData(output);
    } catch {
      setError("No se pudo cargar facturas.");
      setData({ results: [], count: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadInvoices };
};
