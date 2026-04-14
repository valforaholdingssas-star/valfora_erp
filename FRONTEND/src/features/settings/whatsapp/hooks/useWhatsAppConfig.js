import { useEffect, useState } from "react";

import { fetchWhatsAppAccounts } from "../../../../api/whatsapp.js";

const useWhatsAppConfig = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWhatsAppAccounts({ page_size: 100 })
      .then((data) => setAccounts(data.results || []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  return { accounts, loading };
};

export default useWhatsAppConfig;
