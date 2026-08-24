import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Button, Card, Form, Modal, Table } from "react-bootstrap";
import { arrayMove } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";

import {
  bulkUpdateDeals,
  createActivity,
  createDeal,
  createPipelineStage,
  fetchCompanies,
  fetchContacts,
  fetchDeals,
  fetchPipelineStages,
  moveDealStage,
  reorderPipelineStages,
  updatePipelineStage,
} from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import LogDealCallModal from "../components/LogDealCallModal.jsx";
import PipelineColumn from "../components/PipelineColumn.jsx";
import QuickEditDealModal from "../components/QuickEditDealModal.jsx";
import { formatDealDisplayNumber, formatDealValue, resolveUserDisplayName } from "../utils/formatters.js";

const DEAL_SOURCES = [
  ["", "Todos los orígenes"],
  ["whatsapp", "WhatsApp"],
  ["manual", "Manual"],
  ["website", "Website"],
  ["referral", "Referido"],
  ["other", "Otro"],
];

const toStageView = (stage, fallbackIndex = 0) => ({
  id: stage.key,
  dbId: stage.id,
  title: stage.name,
  accent: stage.accent_color || "#3b82f6",
  tint: stage.tint_color || "rgba(59, 130, 246, 0.14)",
  position: typeof stage.position === "number" ? stage.position : fallbackIndex,
  isClosedStage: Boolean(stage.is_closed_stage),
  isWonStage: Boolean(stage.is_won_stage),
  isLostStage: Boolean(stage.is_lost_stage),
});

const buildStageDraft = (stage) => ({
  id: stage.dbId || stage.id,
  key: stage.id,
  name: stage.title,
  accent_color: stage.accent,
  tint_color: stage.tint,
  is_closed_stage: Boolean(stage.isClosedStage),
  is_won_stage: Boolean(stage.isWonStage),
  is_lost_stage: Boolean(stage.isLostStage),
});

const detectPipelineCollision = (args) => {
  const pointerHits = pointerWithin(args);
  const isColumn = (hit) => args.droppableContainers.get(hit.id)?.data?.current?.type === "column";
  const cardHits = pointerHits.filter((hit) => !isColumn(hit));
  const columnHits = pointerHits.filter(isColumn);
  if (cardHits.length) return cardHits;
  if (columnHits.length) return columnHits;
  return closestCorners(args);
};

const slugifyStageName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const fetchAllPages = async (fetcher, params = {}, pageSize = 100) => {
  let page = 1;
  let expectedCount = null;
  const results = [];

  while (true) {
    const payload = await fetcher({ ...params, page, page_size: pageSize });
    const rows = payload?.results || [];
    if (expectedCount === null) {
      expectedCount = Number(payload?.count || rows.length || 0);
    }
    results.push(...rows);
    if (!rows.length || results.length >= expectedCount) break;
    page += 1;
  }

  return { count: expectedCount ?? results.length, results };
};

const DealsPipelinePage = () => {
  const [stages, setStages] = useState([]);
  const [byStage, setByStage] = useState({});
  const [activeDeal, setActiveDeal] = useState(null);
  const [dragOriginStage, setDragOriginStage] = useState(null);
  const [overStageId, setOverStageId] = useState(null);
  const [activityDeal, setActivityDeal] = useState(null);
  const [viewMode, setViewMode] = useState("canvas");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStagesModal, setShowStagesModal] = useState(false);
  const [stageDrafts, setStageDrafts] = useState([]);
  const [stageSaveError, setStageSaveError] = useState("");
  const [stageSaving, setStageSaving] = useState(false);
  const [contacts, setContacts] = useState({ results: [] });
  const [companies, setCompanies] = useState({ results: [] });
  const [users, setUsers] = useState({ results: [] });
  const [companyFilter, setCompanyFilter] = useState("");
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickEditDeal, setQuickEditDeal] = useState(null);
  const [logCallDeal, setLogCallDeal] = useState(null);
  const [selectedDealIds, setSelectedDealIds] = useState([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkForm, setBulkForm] = useState({
    assigned_to: "__unchanged__",
    stage: "",
    source: "",
    probability: "",
  });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    title: "",
    contact: "",
    value: "",
    currency: "USD",
    stage: "",
    probability: 0,
    description: "",
    company: "",
    assigned_to: "",
  });
  const [activitySaving, setActivitySaving] = useState(false);
  const [movingDealId, setMovingDealId] = useState(null);
  const [activityError, setActivityError] = useState("");
  const [activityForm, setActivityForm] = useState({
    subject: "",
    activity_type: "call",
    due_date: "",
    description: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const extractApiError = (err, fallback) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    const first = err?.response?.data?.data ?? err?.response?.data;
    if (first && typeof first === "object") {
      const firstValue = Object.values(first)[0];
      if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
      if (typeof firstValue === "string" && firstValue.trim()) return firstValue;
    }
    if (typeof err?.message === "string" && err.message.trim()) return err.message;
    return fallback;
  };

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (companyFilter) params.company = companyFilter;
    if (assignedToFilter) params.assigned_to = assignedToFilter;
    if (sourceFilter) params.source = sourceFilter;
    if (createdAfter) params.created_after = createdAfter;
    if (createdBefore) params.created_before = createdBefore;
    try {
      const [stagesData, dealsData, contactsData, companiesData, usersData] = await Promise.all([
        fetchAllPages(fetchPipelineStages, {}, 200),
        fetchAllPages(fetchDeals, params, 100),
        fetchAllPages(fetchContacts, {}, 200),
        fetchAllPages(fetchCompanies, {}, 200),
        fetchUsers({ page_size: 200, is_active: true }),
      ]);

      const stageRows = (stagesData?.results || [])
        .map((stage, index) => toStageView(stage, index))
        .sort((a, b) => a.position - b.position);
      const stageKeySet = new Set(stageRows.map((stage) => stage.id));
      const userMap = new Map((usersData?.results || []).map((user) => [user.id, resolveUserDisplayName(user)]));
      const grouped = {};
      stageRows.forEach((stage) => {
        grouped[stage.id] = [];
      });
      (dealsData?.results || []).forEach((deal) => {
        const stageKey = stageKeySet.has(deal.stage) ? deal.stage : stageRows[0]?.id;
        if (!stageKey) return;
        grouped[stageKey] = grouped[stageKey] || [];
        grouped[stageKey].push({
          ...deal,
          stage: stageKey,
          assigned_to_name: deal.assigned_to_name || userMap.get(deal.assigned_to) || "",
        });
      });
      setStages(stageRows);
      setStageDrafts(stageRows.map(buildStageDraft));
      setByStage(grouped);
      setContacts(contactsData || { results: [] });
      setCompanies(companiesData || { results: [] });
      setUsers(usersData || { results: [] });
      setSelectedDealIds([]);
      setCreateForm((prev) => ({ ...prev, stage: prev.stage || stageRows[0]?.id || "" }));
      setError("");
    } catch (err) {
      setError(extractApiError(err, "No se pudieron cargar los deals del pipeline."));
    } finally {
      setLoading(false);
    }
  }, [assignedToFilter, companyFilter, createdAfter, createdBefore, sourceFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const orderedStageIds = useMemo(() => stages.map((stage) => stage.id), [stages]);
  // Manual moves can target any configured stage (including closed call/custom columns).
  const moveStageOptions = useMemo(() => stages, [stages]);

  const getStageForId = (dealId, state = byStage) =>
    stages.find((stage) => (state[stage.id] || []).some((deal) => deal.id === dealId))?.id;

  const findDealById = (dealId, state = byStage) => {
    const stageId = getStageForId(dealId, state);
    if (!stageId) return null;
    return (state[stageId] || []).find((deal) => deal.id === dealId) || null;
  };

  const moveDealAcrossStages = (state, fromStageId, toStageId, activeId, overId) => {
    if (!fromStageId || !toStageId) return state;
    const sourceList = [...(state[fromStageId] || [])];
    const sourceIndex = sourceList.findIndex((deal) => deal.id === activeId);
    if (sourceIndex < 0) return state;
    const [moved] = sourceList.splice(sourceIndex, 1);
    const updatedMoved = { ...moved, stage: toStageId };

    if (fromStageId === toStageId) {
      let targetIndex = sourceList.findIndex((deal) => deal.id === overId);
      if (targetIndex < 0) targetIndex = sourceList.length;
      sourceList.splice(targetIndex, 0, updatedMoved);
      return { ...state, [fromStageId]: sourceList };
    }

    const targetList = [...(state[toStageId] || [])].filter((deal) => deal.id !== activeId);
    let targetIndex = targetList.findIndex((deal) => deal.id === overId);
    if (targetIndex < 0) targetIndex = targetList.length;
    targetList.splice(targetIndex, 0, updatedMoved);
    return {
      ...state,
      [fromStageId]: sourceList,
      [toStageId]: targetList,
    };
  };

  const cloneBoardState = (state) => {
    try {
      return structuredClone(state);
    } catch {
      return JSON.parse(JSON.stringify(state));
    }
  };

  const applyLocalStage = (dealId, toStage, fromStageHint = null) => {
    setByStage((prev) => {
      const fromStage = fromStageHint || getStageForId(dealId, prev);
      if (!fromStage || !toStage || fromStage === toStage) return prev;
      return moveDealAcrossStages(prev, fromStage, toStage, dealId, null);
    });
  };

  const resolveOverStage = (over, state = byStage) => {
    if (!over) return null;
    const overData = over.data?.current;
    if (overData?.type === "column" && overData.stageId) return overData.stageId;
    if (overData?.stage) return overData.stage;
    if (orderedStageIds.includes(over.id)) return over.id;
    return getStageForId(over.id, state);
  };

  const handleDragStart = (event) => {
    const dealId = event.active.id;
    const deal = findDealById(dealId);
    setActiveDeal(deal ? { ...deal } : null);
    setDragOriginStage(getStageForId(dealId));
    setOverStageId(getStageForId(dealId));
    setError("");
  };

  // Highlight only — never mutate board mid-drag (cross-column SortableContext
  // thrashing was blanking the whole React tree).
  const handleDragOver = (event) => {
    const next = resolveOverStage(event.over, byStage);
    setOverStageId((prev) => (prev === next ? prev : next));
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    const originStage = dragOriginStage;
    const dealId = active?.id;
    setActiveDeal(null);
    setDragOriginStage(null);
    setOverStageId(null);

    if (!dealId || !originStage) return;
    if (!over) return;

    const newStage = resolveOverStage(over, byStage);
    if (!newStage) return;

    if (originStage === newStage) {
      setByStage((prev) => {
        const list = [...(prev[originStage] || [])];
        const oldIndex = list.findIndex((deal) => deal.id === dealId);
        const newIndex = list.findIndex((deal) => deal.id === over.id);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
        return { ...prev, [originStage]: arrayMove(list, oldIndex, newIndex) };
      });
      return;
    }

    const previousState = cloneBoardState(byStage);
    applyLocalStage(dealId, newStage, originStage);
    try {
      setMovingDealId(dealId);
      await moveDealStage(dealId, {
        to_stage: newStage,
        notes: "Cambio manual desde pipeline canvas",
      });
      setError("");
    } catch (err) {
      setByStage(previousState);
      setError(extractApiError(err, "No se pudo mover el deal. Se revirtió el cambio."));
    } finally {
      setMovingDealId(null);
    }
  };

  const handleDragCancel = () => {
    setActiveDeal(null);
    setDragOriginStage(null);
    setOverStageId(null);
  };

  const openActivityModal = (deal) => {
    setActivityDeal(deal);
    setActivityError("");
    setActivityForm({
      subject: deal?.title ? `Seguimiento - ${deal.title}` : "",
      activity_type: "call",
      due_date: "",
      description: "",
    });
  };

  const openQuickEdit = (deal) => {
    setQuickEditDeal(deal);
  };

  const bumpDealCallsCount = (dealId) => {
    setByStage((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((stageId) => {
        next[stageId] = (next[stageId] || []).map((deal) =>
          deal.id === dealId
            ? { ...deal, calls_count: Number(deal.calls_count || 0) + 1 }
            : deal,
        );
      });
      return next;
    });
  };

  const applyQuickEditLocally = (updated) => {
    if (!updated?.id) {
      load();
      return;
    }
    setByStage((prev) => {
      let fromStage = null;
      Object.keys(prev).forEach((stageId) => {
        if ((prev[stageId] || []).some((deal) => deal.id === updated.id)) {
          fromStage = stageId;
        }
      });
      if (!fromStage) return prev;
      const toStage = updated.stage || fromStage;
      const userMap = new Map((users.results || []).map((user) => [user.id, resolveUserDisplayName(user)]));
      const companyMap = new Map((companies.results || []).map((company) => [company.id, company.name]));
      const enriched = {
        ...findDealById(updated.id, prev),
        ...updated,
        assigned_to_name: updated.assigned_to_name || userMap.get(updated.assigned_to) || "",
        company_name: updated.company_name || companyMap.get(updated.company) || "",
      };
      if (fromStage === toStage) {
        return {
          ...prev,
          [fromStage]: (prev[fromStage] || []).map((deal) => (deal.id === updated.id ? enriched : deal)),
        };
      }
      const source = (prev[fromStage] || []).filter((deal) => deal.id !== updated.id);
      const target = [{ ...enriched, stage: toStage }, ...(prev[toStage] || []).filter((deal) => deal.id !== updated.id)];
      return { ...prev, [fromStage]: source, [toStage]: target };
    });
  };

  const toggleSelectDeal = (dealId) => {
    setSelectedDealIds((prev) =>
      prev.includes(dealId) ? prev.filter((id) => id !== dealId) : [...prev, dealId],
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = visibleDeals.map((deal) => deal.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedDealIds.includes(id));
    setSelectedDealIds(allSelected ? [] : visibleIds);
  };

  const openBulkEditModal = () => {
    setBulkError("");
    setBulkForm({ assigned_to: "__unchanged__", stage: "", source: "", probability: "" });
    setShowBulkEditModal(true);
  };

  const submitBulkEdit = async (e) => {
    e.preventDefault();
    if (!selectedDealIds.length) {
      setBulkError("Selecciona al menos un deal.");
      return;
    }
    const payload = { ids: selectedDealIds };
    if (bulkForm.assigned_to === "__none__") payload.assigned_to = null;
    else if (bulkForm.assigned_to && bulkForm.assigned_to !== "__unchanged__") {
      payload.assigned_to = bulkForm.assigned_to;
    }
    if (bulkForm.stage) payload.stage = bulkForm.stage;
    if (bulkForm.source) payload.source = bulkForm.source;
    if (bulkForm.probability !== "") payload.probability = Number(bulkForm.probability);
    if (Object.keys(payload).length === 1) {
      setBulkError("Indica al menos un campo para actualizar.");
      return;
    }
    setBulkSaving(true);
    setBulkError("");
    try {
      await bulkUpdateDeals(payload);
      setShowBulkEditModal(false);
      setSelectedDealIds([]);
      await load();
    } catch (err) {
      setBulkError(extractApiError(err, "No se pudieron actualizar los deals seleccionados."));
    } finally {
      setBulkSaving(false);
    }
  };

  const closeActivityModal = () => {
    setActivityDeal(null);
    setActivityError("");
  };

  const submitActivity = async (e) => {
    e.preventDefault();
    if (!activityDeal?.contact) {
      setActivityError("El deal no tiene un contacto asociado.");
      return;
    }
    if (!activityForm.due_date) {
      setActivityError("La fecha y hora son obligatorias para que se refleje en el calendario.");
      return;
    }
    setActivitySaving(true);
    setActivityError("");
    try {
      await createActivity({
        contact: activityDeal.contact,
        deal: activityDeal.id,
        subject: activityForm.subject.trim(),
        activity_type: activityForm.activity_type,
        description: activityForm.description.trim(),
        due_date: new Date(activityForm.due_date).toISOString(),
        is_completed: false,
      });
      closeActivityModal();
    } catch (err) {
      setActivityError(extractApiError(err, "No se pudo crear la actividad."));
    } finally {
      setActivitySaving(false);
    }
  };

  const openCreateModal = () => {
    setShowCreateModal(true);
    setCreateError("");
  };

  const openCreateModalForStage = (stageId) => {
    setCreateForm((prev) => ({ ...prev, stage: stageId }));
    setShowCreateModal(true);
    setCreateError("");
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateError("");
    setCreateForm({
      title: "",
      contact: "",
      value: "",
      currency: "USD",
      stage: stages[0]?.id || "",
      probability: 0,
      description: "",
      company: "",
      assigned_to: "",
    });
  };

  const submitCreateDeal = async (e) => {
    e.preventDefault();
    if (!createForm.contact) {
      setCreateError("Selecciona un contacto.");
      return;
    }
    setCreateSaving(true);
    setCreateError("");
    try {
      await createDeal({
        title: createForm.title.trim(),
        contact: createForm.contact,
        value: createForm.value === "" ? 0 : Number(createForm.value),
        currency: createForm.currency.trim().toUpperCase() || "USD",
        stage: createForm.stage,
        probability: Number(createForm.probability || 0),
        description: createForm.description.trim(),
        company: createForm.company || null,
        assigned_to: createForm.assigned_to || null,
      });
      closeCreateModal();
      load();
    } catch (err) {
      setCreateError(extractApiError(err, "No se pudo crear el deal."));
    } finally {
      setCreateSaving(false);
    }
  };

  const openStageManager = () => {
    setStageDrafts(stages.map(buildStageDraft));
    setStageSaveError("");
    setShowStagesModal(true);
  };

  const moveStageDraft = (index, direction) => {
    setStageDrafts((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      return arrayMove(prev, index, nextIndex);
    });
  };

  const updateStageDraftField = (index, field, value) => {
    setStageDrafts((prev) =>
      prev.map((draft, draftIndex) => {
        if (draftIndex !== index) return draft;
        const next = { ...draft, [field]: value };
        if (field === "is_closed_stage" && !value) {
          next.is_won_stage = false;
          next.is_lost_stage = false;
        }
        if (field === "is_won_stage" && value) {
          next.is_closed_stage = true;
          next.is_lost_stage = false;
        }
        if (field === "is_lost_stage" && value) {
          next.is_closed_stage = true;
          next.is_won_stage = false;
        }
        return next;
      }),
    );
  };

  const addStageDraft = () => {
    const baseName = `Nueva etapa ${stageDrafts.length + 1}`;
    setStageDrafts((prev) => [
      ...prev,
      {
        id: null,
        key: slugifyStageName(baseName) || `etapa_${prev.length + 1}`,
        name: baseName,
        accent_color: "#3b82f6",
        tint_color: "rgba(59, 130, 246, 0.14)",
        is_closed_stage: false,
        is_won_stage: false,
        is_lost_stage: false,
      },
    ]);
  };

  const saveStageManager = async () => {
    setStageSaving(true);
    setStageSaveError("");
    try {
      const seen = new Set();
      for (const draft of stageDrafts) {
        const normalizedKey = slugifyStageName(draft.key || draft.name);
        if (!normalizedKey) throw new Error("Todas las etapas deben tener un nombre válido.");
        if (seen.has(normalizedKey)) throw new Error("Las claves de etapa no pueden repetirse.");
        seen.add(normalizedKey);
        if (draft.id) {
          await updatePipelineStage(draft.id, {
            name: draft.name.trim(),
            accent_color: draft.accent_color,
            tint_color: draft.tint_color,
            is_closed_stage: draft.is_closed_stage,
            is_won_stage: draft.is_won_stage,
            is_lost_stage: draft.is_lost_stage,
          });
        } else {
          await createPipelineStage({
            key: normalizedKey,
            name: draft.name.trim(),
            accent_color: draft.accent_color,
            tint_color: draft.tint_color,
            is_closed_stage: draft.is_closed_stage,
            is_won_stage: draft.is_won_stage,
            is_lost_stage: draft.is_lost_stage,
          });
        }
      }
      const refreshed = await fetchPipelineStages({ page_size: 200 });
      const refreshedStages = (refreshed?.results || [])
        .map((stage, index) => toStageView(stage, index))
        .sort((a, b) => a.position - b.position);
      const idMap = new Map(refreshedStages.map((stage) => [stage.id, stage.dbId]));
      const reorderIds = stageDrafts
        .map((draft) => slugifyStageName(draft.key || draft.name))
        .map((key) => idMap.get(key))
        .filter(Boolean);
      if (reorderIds.length) {
        await reorderPipelineStages(reorderIds);
      }
      setShowStagesModal(false);
      await load();
    } catch (err) {
      setStageSaveError(extractApiError(err, err?.message || "No se pudieron guardar las etapas."));
    } finally {
      setStageSaving(false);
    }
  };

  const allDeals = stages.flatMap((stage) => byStage[stage.id] || []);
  const normalizedQuery = normalizeSearchText(searchQuery);
  const matchesSearch = (deal) => {
    if (!normalizedQuery) return true;
    const haystack = [
      deal.title,
      deal.contact_name,
      deal.company_name,
      deal.assigned_to_name,
      deal.currency,
      deal.source,
      deal.description,
      deal.business_notes,
      deal.id,
    ]
      .filter(Boolean)
      .map((value) => normalizeSearchText(value))
      .join(" ");
    return haystack.includes(normalizedQuery);
  };
  const visibleByStage = stages.reduce((acc, stage) => {
    acc[stage.id] = (byStage[stage.id] || []).filter(matchesSearch);
    return acc;
  }, {});
  const visibleDeals = allDeals.filter(matchesSearch);
  const totalPipelineValue = visibleDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
  const isSearchActive = Boolean(normalizedQuery);

  if (loading) {
    return (
      <div className="crm-pipeline-page">
        <div className="crm-pipeline-skeleton crm-pipeline-skeleton-header" />
        <div className="crm-pipeline-skeleton crm-pipeline-skeleton-toolbar" />
        <div className="crm-pipeline-board">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="crm-pipeline-skeleton crm-pipeline-skeleton-column" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="crm-pipeline-page">
      <div className="crm-pipeline-breadcrumb">
        <Link to="/crm" className="crm-pipeline-breadcrumb-link">CRM</Link>
        <i className="bi bi-chevron-right" />
        <span>Pipeline de deals</span>
      </div>

      <div className="crm-pipeline-header">
        <div className="crm-pipeline-header-copy">
          <h1>Pipeline de deals</h1>
          <p>Embudo dinámico por etapas, valor comercial, asignación y operación sin salir del tablero.</p>
        </div>
        <div className="crm-pipeline-header-actions">
          <div className="crm-view-switch" role="group" aria-label="Vista pipeline">
            <button type="button" className={viewMode === "canvas" ? "is-active" : ""} onClick={() => setViewMode("canvas")}>
              <i className="bi bi-kanban" />
              Canvas
            </button>
            <button type="button" className={viewMode === "table" ? "is-active" : ""} onClick={() => setViewMode("table")}>
              <i className="bi bi-table" />
              Tabla
            </button>
          </div>
          <button type="button" className="crm-header-btn" onClick={openStageManager}>
            <i className="bi bi-sliders" />
            Etapas
          </button>
          <button type="button" className="crm-header-btn crm-header-btn-primary" onClick={openCreateModal}>
            <i className="bi bi-plus-lg" />
            Nuevo deal
          </button>
          <button type="button" className="crm-header-btn" onClick={load}>
            <i className="bi bi-arrow-repeat" />
            Recargar
          </button>
        </div>
      </div>

      <div className="crm-pipeline-toolbar">
        <div className="crm-toolbar-search">
          <i className="bi bi-search" />
          <input
            type="text"
            placeholder="Buscar deal, contacto, empresa o asignado"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="crm-toolbar-filters">
          <div className="crm-toolbar-filter">
            <span>Empresa</span>
            <Form.Select size="sm" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="">Todas</option>
              {(companies.results || []).map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </Form.Select>
          </div>
          <div className="crm-toolbar-filter">
            <span>Asignado</span>
            <Form.Select size="sm" value={assignedToFilter} onChange={(e) => setAssignedToFilter(e.target.value)}>
              <option value="">Todos</option>
              {(users.results || []).map((user) => (
                <option key={user.id} value={user.id}>{resolveUserDisplayName(user)}</option>
              ))}
            </Form.Select>
          </div>
          <div className="crm-toolbar-filter">
            <span>Origen</span>
            <Form.Select size="sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              {DEAL_SOURCES.map(([value, label]) => (
                <option key={value || "all"} value={value}>{label}</option>
              ))}
            </Form.Select>
          </div>
          <div className="crm-toolbar-filter">
            <span>Desde</span>
            <Form.Control
              type="date"
              size="sm"
              value={createdAfter}
              onChange={(e) => setCreatedAfter(e.target.value)}
            />
          </div>
          <div className="crm-toolbar-filter">
            <span>Hasta</span>
            <Form.Control
              type="date"
              size="sm"
              value={createdBefore}
              onChange={(e) => setCreatedBefore(e.target.value)}
            />
          </div>
        </div>
        <div className="crm-toolbar-summary">
          <div className="crm-toolbar-summary-block">
            <strong>{visibleDeals.length}</strong>
            <span>oportunidades</span>
          </div>
          <div className="crm-toolbar-summary-divider" />
          <div className="crm-toolbar-summary-block">
            <strong>{formatDealValue(totalPipelineValue)}</strong>
            <span>valor pipeline</span>
          </div>
        </div>
      </div>

      {error ? <Alert variant="danger" className="py-2 small mb-3">{error}</Alert> : null}

      {viewMode === "canvas" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={detectPipelineCollision}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="crm-pipeline-board-shell">
            <div className="crm-pipeline-board">
              {stages.map((stage) => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  deals={visibleByStage[stage.id] || []}
                  stageTotal={formatDealValue((visibleByStage[stage.id] || []).reduce((sum, deal) => sum + Number(deal.value || 0), 0))}
                  isOver={overStageId === stage.id && Boolean(activeDeal)}
                  onCreateActivity={openActivityModal}
                  onCreateDeal={openCreateModalForStage}
                  onQuickEdit={openQuickEdit}
                  onLogCall={setLogCallDeal}
                  sortable={!isSearchActive}
                />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={null}>
            {activeDeal ? (
              <Card className="shadow-sm crm-pipeline-drag-card">
                <Card.Body>
                  <div className="crm-pipeline-card-topline">
                    <span className="pipeline-chip pipeline-chip-neutral">Moviendo</span>
                    <span className="pipeline-chip pipeline-chip-company">{activeDeal.company_name || "Sin empresa"}</span>
                  </div>
                  <div className="crm-pipeline-drag-title">
                    {activeDeal.title || activeDeal.contact_name || `Deal ${String(activeDeal.id || "").slice(0, 8)}`}
                  </div>
                  <div className="crm-pipeline-drag-meta">{formatDealValue(activeDeal.value)} {activeDeal.currency}</div>
                  <div className="crm-pipeline-drag-contact">{activeDeal.contact_name}</div>
                </Card.Body>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="crm-pipeline-table-shell">
          {selectedDealIds.length > 0 ? (
            <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
              <span className="small text-muted">{selectedDealIds.length} seleccionados</span>
              <Button size="sm" variant="primary" onClick={openBulkEditModal}>
                <i className="bi bi-pencil-square me-1" />
                Editar seleccionados
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={() => setSelectedDealIds([])}>
                Limpiar selección
              </Button>
            </div>
          ) : null}
          <div className="crm-pipeline-table-wrap">
            <Table responsive className="crm-pipeline-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <Form.Check
                      aria-label="Seleccionar todos"
                      checked={visibleDeals.length > 0 && visibleDeals.every((deal) => selectedDealIds.includes(deal.id))}
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th>#</th>
                  <th>Deal</th>
                  <th>Contacto</th>
                  <th>Empresa</th>
                  <th>Asignado</th>
                  <th>Valor</th>
                  <th>Etapa</th>
                  <th>Mover a</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleDeals.map((deal, index) => (
                  <tr key={deal.id}>
                    <td>
                      <Form.Check
                        aria-label={`Seleccionar ${deal.title || deal.id}`}
                        checked={selectedDealIds.includes(deal.id)}
                        onChange={() => toggleSelectDeal(deal.id)}
                      />
                    </td>
                    <td><span className="crm-table-pill">{formatDealDisplayNumber(deal.id, index)}</span></td>
                    <td><div className="crm-table-title">{deal.title || "Sin título"}</div></td>
                    <td>{deal.contact_name || "—"}</td>
                    <td>{deal.company_name || "Sin empresa"}</td>
                    <td>{deal.assigned_to_name || "Sin asignar"}</td>
                    <td>{formatDealValue(deal.value)} {deal.currency}</td>
                    <td><span className="crm-table-stage">{stages.find((stage) => stage.id === deal.stage)?.title || deal.stage}</span></td>
                    <td>
                      <Form.Select
                        size="sm"
                        value={deal.stage}
                        disabled={movingDealId === deal.id}
                        onChange={async (e) => {
                          const toStage = e.target.value;
                          if (toStage === deal.stage) return;
                          const fromStage = deal.stage;
                          const snapshot = cloneBoardState(byStage);
                          applyLocalStage(deal.id, toStage, fromStage);
                          try {
                            setMovingDealId(deal.id);
                            await moveDealStage(deal.id, { to_stage: toStage, notes: "Cambio manual desde tabla" });
                            setError("");
                          } catch (err) {
                            setByStage(snapshot);
                            setError(extractApiError(err, "No se pudo mover el deal."));
                          } finally {
                            setMovingDealId(null);
                          }
                        }}
                      >
                        {moveStageOptions.map((stage) => (
                          <option key={stage.id} value={stage.id}>{stage.title}</option>
                        ))}
                      </Form.Select>
                    </td>
                    <td>
                      <div className="crm-table-actions">
                        <Button size="sm" variant="outline-primary" onClick={() => openQuickEdit(deal)}>Editar</Button>
                        <Button as={Link} to={`/crm/deals/${deal.id}`} size="sm" variant="outline-secondary">Ver detalle</Button>
                        <Button as={Link} to={`/chat/deal/${deal.id}`} size="sm" variant="outline-success">Chat</Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => openActivityModal(deal)}>Actividad</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleDeals.length ? (
                  <tr>
                    <td colSpan={10} className="text-muted text-center py-5">No hay deals para mostrar con los filtros actuales.</td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </div>
      )}

      <Modal show={showCreateModal} onHide={closeCreateModal} centered>
        <Form onSubmit={submitCreateDeal}>
          <Modal.Header closeButton>
            <Modal.Title>Nuevo deal</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            {createError ? <Alert variant="danger" className="py-2 mb-0">{createError}</Alert> : null}
            <Form.Group>
              <Form.Label>Título</Form.Label>
              <Form.Control required value={createForm.title} onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Contacto</Form.Label>
              <Form.Select
                required
                value={createForm.contact}
                onChange={(e) => {
                  const contactId = e.target.value;
                  const selectedContact = (contacts.results || []).find((contact) => contact.id === contactId);
                  setCreateForm((prev) => ({
                    ...prev,
                    contact: contactId,
                    company: prev.company || selectedContact?.company || "",
                  }));
                }}
              >
                <option value="">Selecciona un contacto</option>
                {(contacts.results || []).map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.first_name} {contact.last_name} {contact.email ? `· ${contact.email}` : ""}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <div className="row g-3">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Valor</Form.Label>
                  <Form.Control type="number" min="0" step="0.01" value={createForm.value} onChange={(e) => setCreateForm((prev) => ({ ...prev, value: e.target.value }))} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Moneda</Form.Label>
                  <Form.Control value={createForm.currency} onChange={(e) => setCreateForm((prev) => ({ ...prev, currency: e.target.value }))} />
                </Form.Group>
              </div>
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Etapa</Form.Label>
                  <Form.Select value={createForm.stage} onChange={(e) => setCreateForm((prev) => ({ ...prev, stage: e.target.value }))}>
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>{stage.title}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Probabilidad %</Form.Label>
                  <Form.Control type="number" min="0" max="100" value={createForm.probability} onChange={(e) => setCreateForm((prev) => ({ ...prev, probability: e.target.value }))} />
                </Form.Group>
              </div>
            </div>
            <div className="row g-3">
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Empresa</Form.Label>
                  <Form.Select value={createForm.company} onChange={(e) => setCreateForm((prev) => ({ ...prev, company: e.target.value }))}>
                    <option value="">Sin empresa</option>
                    {(companies.results || []).map((company) => (
                      <option key={company.id} value={company.id}>{company.name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group>
                  <Form.Label>Asignado a</Form.Label>
                  <Form.Select value={createForm.assigned_to} onChange={(e) => setCreateForm((prev) => ({ ...prev, assigned_to: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {(users.results || []).map((user) => (
                      <option key={user.id} value={user.id}>{resolveUserDisplayName(user)}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
            </div>
            <Form.Group>
              <Form.Label>Descripción</Form.Label>
              <Form.Control as="textarea" rows={3} value={createForm.description} onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeCreateModal}>Cancelar</Button>
            <Button type="submit" disabled={createSaving}>{createSaving ? "Creando..." : "Crear deal"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showStagesModal} onHide={() => setShowStagesModal(false)} centered size="xl">
        <Modal.Header closeButton>
          <Modal.Title>Administrar etapas del pipeline</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3">
          {stageSaveError ? <Alert variant="danger" className="py-2 mb-0">{stageSaveError}</Alert> : null}
          {stageDrafts.map((draft, index) => (
            <Card key={`${draft.id || "new"}-${index}`} className="border-0 shadow-sm">
              <Card.Body className="d-grid gap-3">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <div>
                    <strong>{draft.name || `Etapa ${index + 1}`}</strong>
                    <div className="small text-muted">{draft.key}</div>
                  </div>
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-secondary" disabled={index === 0} onClick={() => moveStageDraft(index, -1)}>
                      <i className="bi bi-arrow-up" />
                    </Button>
                    <Button size="sm" variant="outline-secondary" disabled={index === stageDrafts.length - 1} onClick={() => moveStageDraft(index, 1)}>
                      <i className="bi bi-arrow-down" />
                    </Button>
                  </div>
                </div>
                <div className="row g-3">
                  <div className="col-md-6">
                    <Form.Group>
                      <Form.Label>Nombre</Form.Label>
                      <Form.Control value={draft.name} onChange={(e) => updateStageDraftField(index, "name", e.target.value)} />
                    </Form.Group>
                  </div>
                  <div className="col-md-6">
                    <Form.Group>
                      <Form.Label>Clave interna</Form.Label>
                      <Form.Control
                        value={draft.key}
                        disabled={Boolean(draft.id)}
                        onChange={(e) => updateStageDraftField(index, "key", e.target.value)}
                      />
                    </Form.Group>
                  </div>
                  <div className="col-md-6">
                    <Form.Group>
                      <Form.Label>Color acento</Form.Label>
                      <Form.Control type="color" value={draft.accent_color} onChange={(e) => updateStageDraftField(index, "accent_color", e.target.value)} />
                    </Form.Group>
                  </div>
                  <div className="col-md-6">
                    <Form.Group>
                      <Form.Label>Tinte</Form.Label>
                      <Form.Control value={draft.tint_color} onChange={(e) => updateStageDraftField(index, "tint_color", e.target.value)} />
                    </Form.Group>
                  </div>
                </div>
                <div className="d-flex flex-wrap gap-3">
                  <Form.Check type="switch" label="Etapa cerrada" checked={draft.is_closed_stage} onChange={(e) => updateStageDraftField(index, "is_closed_stage", e.target.checked)} />
                  <Form.Check type="switch" label="Ganado" checked={draft.is_won_stage} onChange={(e) => updateStageDraftField(index, "is_won_stage", e.target.checked)} />
                  <Form.Check type="switch" label="Perdido" checked={draft.is_lost_stage} onChange={(e) => updateStageDraftField(index, "is_lost_stage", e.target.checked)} />
                </div>
              </Card.Body>
            </Card>
          ))}
          <Button variant="outline-primary" onClick={addStageDraft}>
            <i className="bi bi-plus-lg me-2" />
            Agregar etapa
          </Button>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowStagesModal(false)}>Cerrar</Button>
          <Button onClick={saveStageManager} disabled={stageSaving}>{stageSaving ? "Guardando..." : "Guardar etapas"}</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(activityDeal)} onHide={closeActivityModal} centered>
        <Form onSubmit={submitActivity}>
          <Modal.Header closeButton>
            <Modal.Title>Nueva actividad</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            {activityError ? <Alert variant="danger" className="py-2 mb-0">{activityError}</Alert> : null}
            <Form.Group>
              <Form.Label>Asunto</Form.Label>
              <Form.Control value={activityForm.subject} onChange={(e) => setActivityForm((prev) => ({ ...prev, subject: e.target.value }))} required />
            </Form.Group>
            <Form.Group>
              <Form.Label>Tipo</Form.Label>
              <Form.Select value={activityForm.activity_type} onChange={(e) => setActivityForm((prev) => ({ ...prev, activity_type: e.target.value }))}>
                <option value="call">Llamada</option>
                <option value="meeting">Reunión</option>
                <option value="email">Correo</option>
                <option value="task">Tarea</option>
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Fecha y hora</Form.Label>
              <Form.Control type="datetime-local" value={activityForm.due_date} onChange={(e) => setActivityForm((prev) => ({ ...prev, due_date: e.target.value }))} required />
            </Form.Group>
            <Form.Group>
              <Form.Label>Descripción</Form.Label>
              <Form.Control as="textarea" rows={3} value={activityForm.description} onChange={(e) => setActivityForm((prev) => ({ ...prev, description: e.target.value }))} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeActivityModal}>Cancelar</Button>
            <Button type="submit" disabled={activitySaving}>{activitySaving ? "Creando..." : "Crear actividad"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <QuickEditDealModal
        show={Boolean(quickEditDeal)}
        deal={quickEditDeal}
        users={users.results || []}
        companies={companies.results || []}
        stages={stages}
        onHide={() => setQuickEditDeal(null)}
        onSaved={applyQuickEditLocally}
      />

      <LogDealCallModal
        show={Boolean(logCallDeal)}
        deal={logCallDeal}
        onHide={() => setLogCallDeal(null)}
        onLogged={(_call, deal) => {
          if (deal?.id) bumpDealCallsCount(deal.id);
        }}
      />

      <Modal show={showBulkEditModal} onHide={() => setShowBulkEditModal(false)} centered>
        <Form onSubmit={submitBulkEdit}>
          <Modal.Header closeButton>
            <Modal.Title>Editar seleccionados ({selectedDealIds.length})</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            {bulkError ? <Alert variant="danger" className="py-2 mb-0">{bulkError}</Alert> : null}
            <p className="small text-muted mb-0">Deja en blanco los campos que no quieras cambiar.</p>
            <Form.Group>
              <Form.Label>Asignado a</Form.Label>
              <Form.Select
                value={bulkForm.assigned_to}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, assigned_to: e.target.value }))}
              >
                <option value="__unchanged__">Sin cambio</option>
                <option value="__none__">Sin asignar</option>
                {(users.results || []).map((user) => (
                  <option key={user.id} value={user.id}>{resolveUserDisplayName(user)}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Etapa</Form.Label>
              <Form.Select
                value={bulkForm.stage}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, stage: e.target.value }))}
              >
                <option value="">Sin cambio</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.title}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Origen</Form.Label>
              <Form.Select
                value={bulkForm.source}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, source: e.target.value }))}
              >
                <option value="">Sin cambio</option>
                {DEAL_SOURCES.filter(([value]) => value).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Probabilidad %</Form.Label>
              <Form.Control
                type="number"
                min="0"
                max="100"
                placeholder="Sin cambio"
                value={bulkForm.probability}
                onChange={(e) => setBulkForm((prev) => ({ ...prev, probability: e.target.value }))}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowBulkEditModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={bulkSaving}>{bulkSaving ? "Guardando..." : "Aplicar cambios"}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default DealsPipelinePage;
