import { useCallback, useEffect, useState } from "react";

import {
  fetchLeadEngineConfig,
  fetchPipelineAutomationConfig,
  updateLeadEngineConfig,
  updatePipelineAutomationConfig,
} from "../../../../api/settings.js";

const useLeadEngineConfig = () => {
  const [leadConfig, setLeadConfig] = useState(null);
  const [pipelineConfig, setPipelineConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [lead, pipeline] = await Promise.all([
        fetchLeadEngineConfig(),
        fetchPipelineAutomationConfig(),
      ]);
      setLeadConfig(lead);
      setPipelineConfig(pipeline);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const saveLeadConfig = async (payload) => {
    const updated = await updateLeadEngineConfig(payload);
    setLeadConfig(updated);
    return updated;
  };

  const savePipelineConfig = async (payload) => {
    const updated = await updatePipelineAutomationConfig(payload);
    setPipelineConfig(updated);
    return updated;
  };

  return {
    leadConfig,
    pipelineConfig,
    loading,
    reload,
    saveLeadConfig,
    savePipelineConfig,
  };
};

export default useLeadEngineConfig;
