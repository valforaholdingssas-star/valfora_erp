import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors } from "@dnd-kit/core";
import { Card, Form, Spinner } from "react-bootstrap";

import { fetchLinkedInProspects, moveLinkedInProspectStage } from "../../../api/linkedin.js";
import PipelineColumn from "../../crm/components/PipelineColumn.jsx";

const STAGES = [
  { id: "contacted", title: "Contactado", accent: "#2563eb", tint: "rgba(37, 99, 235, 0.14)" },
  { id: "low_interest", title: "Interés bajo", accent: "#f59e0b", tint: "rgba(245, 158, 11, 0.16)" },
  { id: "high_interest", title: "Interés alto", accent: "#16a34a", tint: "rgba(22, 163, 74, 0.16)" },
  { id: "meeting_scheduling", title: "En agendamiento", accent: "#0891b2", tint: "rgba(8, 145, 178, 0.16)" },
  { id: "proposal_sent", title: "Propuesta enviada", accent: "#7c3aed", tint: "rgba(124, 58, 237, 0.16)" },
  { id: "no_response", title: "No contesta", accent: "#dc2626", tint: "rgba(220, 38, 38, 0.16)" },
];

const stageIds = new Set(STAGES.map((s) => s.id));

const LinkedInPipelinePage = () => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeProspect, setActiveProspect] = useState(null);
  const [byStage, setByStage] = useState({});
  const [inlineEdit, setInlineEdit] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchLinkedInProspects({ page_size: 300 });
      const map = STAGES.reduce((acc, s) => ({ ...acc, [s.id]: [] }), {});
      for (const p of data.results || []) {
        if (!map[p.funnel_stage]) continue;
        map[p.funnel_stage].push(p);
      }
      setByStage(map);
    } catch {
      setError("No se pudo cargar el pipeline de LinkedIn.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flatProspects = useMemo(() => Object.values(byStage).flat(), [byStage]);

  const getStageForId = (id, state = byStage) =>
    STAGES.find((stage) => (state[stage.id] || []).some((item) => item.id === id))?.id;

  const findProspectById = (id, state = byStage) => {
    const stageId = getStageForId(id, state);
    if (!stageId) return null;
    return (state[stageId] || []).find((item) => item.id === id) || null;
  };

  const moveAcrossStages = (state, fromStage, toStage, activeId, overId) => {
    const source = [...(state[fromStage] || [])];
    const target = fromStage === toStage ? source : [...(state[toStage] || [])];
    const sourceIndex = source.findIndex((i) => i.id === activeId);
    if (sourceIndex < 0) return state;
    const [moved] = source.splice(sourceIndex, 1);
    const movedNext = { ...moved, funnel_stage: toStage };
    let targetIndex = target.findIndex((i) => i.id === overId);
    if (targetIndex < 0) targetIndex = target.length;
    target.splice(targetIndex, 0, movedNext);
    return { ...state, [fromStage]: source, [toStage]: target };
  };

  const onDragStart = (event) => {
    setActiveProspect(findProspectById(event.active.id));
  };

  const onDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    setByStage((prev) => {
      const fromStage = getStageForId(activeId, prev);
      const overStage = stageIds.has(overId) ? overId : getStageForId(overId, prev);
      if (!fromStage || !overStage || fromStage === overStage) return prev;
      return moveAcrossStages(prev, fromStage, overStage, activeId, overId);
    });
  };

  const onDragEnd = async (event) => {
    const { active, over } = event;
    setActiveProspect(null);
    if (!over) return;
    const oldState = structuredClone(byStage);
    const fromStage = getStageForId(active.id, oldState);
    const toStage = stageIds.has(over.id) ? over.id : getStageForId(over.id, byStage);
    if (!fromStage || !toStage || fromStage === toStage) return;
    try {
      await moveLinkedInProspectStage(active.id, { to_stage: toStage });
    } catch {
      setByStage(oldState);
      setError("No se pudo mover el prospecto. Se revirtió el cambio.");
    }
  };

  const updateInline = async (prospectId) => {
    const target = flatProspects.find((p) => p.id === prospectId);
    if (!target) return;
    const draft = inlineEdit[prospectId] || {};
    try {
      await moveLinkedInProspectStage(prospectId, { to_stage: draft.funnel_stage || target.funnel_stage });
      await load();
    } catch {
      setError("No se pudo guardar el cambio de etapa.");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-headline mb-3">
        <h1 className="h4 mb-1">Pipeline LinkedIn</h1>
        <p className="text-muted mb-0">Mueve prospectos entre etapas del embudo comercial y gestiona prioridad.</p>
      </div>
      {error ? <div className="alert alert-warning py-2 small">{error}</div> : null}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="pipeline-board">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={(byStage[stage.id] || []).map((p) => ({
                id: p.id,
                title: p.full_name,
                contact_name: p.product_interest || p.company_name || "Sin producto definido",
                value: p.opportunity_value || 0,
                currency: p.opportunity_currency || "USD",
              }))}
            />
          ))}
        </div>
        <DragOverlay>
          {activeProspect ? (
            <Card className="shadow pipeline-card" style={{ width: "300px" }}>
              <Card.Body className="py-2 px-2">
                <div className="small fw-medium">{activeProspect.full_name}</div>
                <div className="text-muted small">{activeProspect.product_interest || activeProspect.company_name || "-"}</div>
              </Card.Body>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
      <Card className="mt-3 app-section-card">
        <Card.Body>
          <h2 className="h6 mb-2">Ajuste rápido por contacto</h2>
          <div className="d-grid gap-2">
            {flatProspects.slice(0, 30).map((p) => (
              <div key={p.id} className="d-flex flex-wrap gap-2 align-items-center border rounded p-2">
                <div className="fw-semibold small" style={{ minWidth: 220 }}>{p.full_name}</div>
                <Form.Select
                  size="sm"
                  style={{ maxWidth: 260 }}
                  value={inlineEdit[p.id]?.funnel_stage || p.funnel_stage}
                  onChange={(e) =>
                    setInlineEdit((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || {}), funnel_stage: e.target.value } }))
                  }
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </Form.Select>
                <button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => void updateInline(p.id)}>
                  Guardar
                </button>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default LinkedInPipelinePage;
