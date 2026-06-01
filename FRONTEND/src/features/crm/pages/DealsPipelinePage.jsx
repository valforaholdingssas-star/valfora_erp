import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Button, Card, Form, Modal, Spinner, Table } from "react-bootstrap";
import { arrayMove } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";

import { createActivity, createDeal, fetchContacts, fetchDeals, moveDealStage } from "../../../api/crm.js";
import PipelineColumn from "../components/PipelineColumn.jsx";
import { formatDealValue } from "../utils/formatters.js";

const STAGES = [
  { id: "new_lead", title: "Nuevo lead", accent: "#3b82f6", tint: "rgba(59, 130, 246, 0.14)" },
  { id: "contacted", title: "Contactado", accent: "#0ea5e9", tint: "rgba(14, 165, 233, 0.14)" },
  { id: "qualified", title: "Calificado", accent: "#8b5cf6", tint: "rgba(139, 92, 246, 0.14)" },
  { id: "qualification", title: "Calificación (legacy)", accent: "#64748b", tint: "rgba(100, 116, 139, 0.14)" },
  { id: "proposal", title: "Propuesta", accent: "#f59e0b", tint: "rgba(245, 158, 11, 0.14)" },
  { id: "negotiation", title: "Negociación", accent: "#f97316", tint: "rgba(249, 115, 22, 0.14)" },
  { id: "closed_won", title: "Ganado", accent: "#22c55e", tint: "rgba(34, 197, 94, 0.14)" },
  { id: "closed_lost", title: "Perdido", accent: "#ef4444", tint: "rgba(239, 68, 68, 0.14)" },
];

const DealsPipelinePage = () => {
  const [byStage, setByStage] = useState({});
  const [activeDeal, setActiveDeal] = useState(null);
  const [dragOriginStage, setDragOriginStage] = useState(null);
  const [activityDeal, setActivityDeal] = useState(null);
  const [viewMode, setViewMode] = useState("canvas");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contacts, setContacts] = useState({ results: [] });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    title: "",
    contact: "",
    value: "",
    currency: "USD",
    stage: "new_lead",
    probability: 0,
    description: "",
  });
  const [activitySaving, setActivitySaving] = useState(false);
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

  const load = useCallback(() => {
    Promise.all([fetchDeals({ page_size: 200 }), fetchContacts({ page_size: 200 })])
      .then(([data, contactsData]) => {
        const map = {};
        STAGES.forEach((s) => {
          map[s.id] = [];
        });
        (data.results || []).forEach((d) => {
          if (!map[d.stage]) map[d.stage] = [];
          map[d.stage].push(d);
        });
        setByStage(map);
        setContacts(contactsData || { results: [] });
        setError("");
      })
      .catch(() => setError("No se pudieron cargar los deals del pipeline."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getStageForId = (dealId, state = byStage) =>
    STAGES.find((stage) => (state[stage.id] || []).some((d) => d.id === dealId))?.id;

  const findDealById = (dealId, state = byStage) => {
    const stageId = getStageForId(dealId, state);
    if (!stageId) return null;
    return (state[stageId] || []).find((d) => d.id === dealId) || null;
  };

  const moveDealAcrossStages = (state, fromStageId, toStageId, activeId, overId) => {
    const sourceList = [...(state[fromStageId] || [])];
    const targetList = fromStageId === toStageId ? sourceList : [...(state[toStageId] || [])];

    const sourceIndex = sourceList.findIndex((d) => d.id === activeId);
    if (sourceIndex < 0) return state;
    const [moved] = sourceList.splice(sourceIndex, 1);
    const updatedMoved = { ...moved, stage: toStageId };

    let targetIndex = targetList.findIndex((d) => d.id === overId);
    if (targetIndex < 0) targetIndex = targetList.length;
    targetList.splice(targetIndex, 0, updatedMoved);

    return {
      ...state,
      [fromStageId]: sourceList,
      [toStageId]: targetList,
    };
  };

  const handleDragStart = (event) => {
    const { active } = event;
    const deal = findDealById(active.id);
    setActiveDeal(deal);
    setDragOriginStage(getStageForId(active.id));
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;

    setByStage((prev) => {
      const fromStage = getStageForId(activeId, prev);
      const overStage = STAGES.some((s) => s.id === overId) ? overId : getStageForId(overId, prev);
      if (!fromStage || !overStage || fromStage === overStage) return prev;
      return moveDealAcrossStages(prev, fromStage, overStage, activeId, overId);
    });
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveDeal(null);
    const originStage = dragOriginStage;
    setDragOriginStage(null);
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;

    const previousState = structuredClone(byStage);
    const oldStage = originStage || getStageForId(activeId, previousState);
    const newStage = STAGES.some((s) => s.id === overId) ? overId : getStageForId(overId, byStage);
    if (!oldStage || !newStage) return;

    if (oldStage === newStage) {
      setByStage((prev) => {
        const list = [...(prev[oldStage] || [])];
        const oldIndex = list.findIndex((d) => d.id === activeId);
        const newIndex = list.findIndex((d) => d.id === overId);
        if (oldIndex < 0 || newIndex < 0) return prev;
        return { ...prev, [oldStage]: arrayMove(list, oldIndex, newIndex) };
      });
      return;
    }

    try {
      await moveDealStage(activeId, { to_stage: newStage, notes: "Cambio manual desde pipeline canvas" });
      setError("");
    } catch {
      setByStage(previousState);
      setError("No se pudo mover el deal. Se revirtió el cambio.");
    }
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
    setActivitySaving(true);
    setActivityError("");
    try {
      await createActivity({
        contact: activityDeal.contact,
        deal: activityDeal.id,
        subject: activityForm.subject.trim(),
        activity_type: activityForm.activity_type,
        description: activityForm.description.trim(),
        due_date: activityForm.due_date ? new Date(activityForm.due_date).toISOString() : null,
        is_completed: false,
      });
      setActivitySaving(false);
      closeActivityModal();
    } catch {
      setActivityError("No se pudo crear la actividad.");
      setActivitySaving(false);
    }
  };

  const openCreateModal = () => {
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
      stage: "new_lead",
      probability: 0,
      description: "",
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
      });
      closeCreateModal();
      load();
    } catch {
      setCreateError("No se pudo crear el deal.");
    } finally {
      setCreateSaving(false);
    }
  };

  const allDeals = STAGES.flatMap((s) => byStage[s.id] || []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="app-page-header mb-3 app-page-headline d-flex justify-content-between align-items-end flex-wrap gap-2">
        <div>
          <h1 className="h4 mb-1">Pipeline de deals</h1>
          <p className="text-muted mb-0">Arrastra oportunidades entre etapas y registra actividades en contexto.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Vista pipeline">
            <Button
              variant={viewMode === "canvas" ? "primary" : "outline-primary"}
              onClick={() => setViewMode("canvas")}
            >
              Canvas
            </Button>
            <Button
              variant={viewMode === "table" ? "primary" : "outline-primary"}
              onClick={() => setViewMode("table")}
            >
              Tabla
            </Button>
          </div>
          <Button size="sm" onClick={openCreateModal}>
            <i className="bi bi-plus-lg me-1" />
            Nuevo deal
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={load}>
            <i className="bi bi-arrow-repeat me-1" />
            Recargar
          </Button>
        </div>
      </div>
      {error && (
        <Alert variant="danger" className="py-2 small">
          {error}
        </Alert>
      )}
      {viewMode === "canvas" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="pipeline-board">
            {STAGES.map((stage) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                deals={byStage[stage.id] || []}
                onCreateActivity={openActivityModal}
              />
            ))}
          </div>
          <DragOverlay>
            {activeDeal ? (
              <Card className="shadow pipeline-card" style={{ width: "300px" }}>
                <Card.Body className="py-2 px-2">
                  <div className="small fw-medium">
                    {activeDeal.title || activeDeal.contact_name || `Deal ${activeDeal.id.slice(0, 8)}`}
                  </div>
                  <div className="text-muted small">
                    {formatDealValue(activeDeal.value)} {activeDeal.currency}
                  </div>
                  <div className="text-muted small">{activeDeal.contact_name}</div>
                </Card.Body>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="app-section-card p-2">
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Contacto</th>
                <th>Valor</th>
                <th>Etapa</th>
                <th style={{ width: 220 }}>Mover a</th>
                <th style={{ width: 180 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {allDeals.map((deal) => (
                <tr key={deal.id}>
                  <td>{deal.title}</td>
                  <td>{deal.contact_name || "—"}</td>
                  <td>{formatDealValue(deal.value)} {deal.currency}</td>
                  <td>{deal.stage}</td>
                  <td>
                    <Form.Select
                      size="sm"
                      value={deal.stage}
                      onChange={async (e) => {
                        try {
                          await moveDealStage(deal.id, {
                            to_stage: e.target.value,
                            notes: "Cambio manual desde tabla",
                          });
                          load();
                        } catch {
                          setError("No se pudo mover el deal.");
                        }
                      }}
                    >
                      {STAGES.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td className="d-flex gap-2">
                    <Button as={Link} to={`/crm/deals/${deal.id}`} size="sm" variant="outline-primary">
                      Abrir
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => openActivityModal(deal)}>
                      Actividad
                    </Button>
                  </td>
                </tr>
              ))}
              {!allDeals.length ? (
                <tr>
                  <td colSpan={6} className="text-muted">No hay deals para mostrar.</td>
                </tr>
              ) : null}
            </tbody>
          </Table>
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
              <Form.Control
                required
                value={createForm.title}
                onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Contacto</Form.Label>
              <Form.Select
                required
                value={createForm.contact}
                onChange={(e) => setCreateForm((p) => ({ ...p, contact: e.target.value }))}
              >
                <option value="">Selecciona un contacto</option>
                {(contacts.results || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} {c.email ? `· ${c.email}` : ""}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <div className="row g-2">
              <div className="col-6">
                <Form.Group>
                  <Form.Label>Valor</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm.value}
                    onChange={(e) => setCreateForm((p) => ({ ...p, value: e.target.value }))}
                  />
                </Form.Group>
              </div>
              <div className="col-6">
                <Form.Group>
                  <Form.Label>Moneda</Form.Label>
                  <Form.Control
                    value={createForm.currency}
                    onChange={(e) => setCreateForm((p) => ({ ...p, currency: e.target.value }))}
                  />
                </Form.Group>
              </div>
            </div>
            <div className="row g-2">
              <div className="col-7">
                <Form.Group>
                  <Form.Label>Etapa</Form.Label>
                  <Form.Select
                    value={createForm.stage}
                    onChange={(e) => setCreateForm((p) => ({ ...p, stage: e.target.value }))}
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-5">
                <Form.Group>
                  <Form.Label>Probabilidad %</Form.Label>
                  <Form.Control
                    type="number"
                    min="0"
                    max="100"
                    value={createForm.probability}
                    onChange={(e) => setCreateForm((p) => ({ ...p, probability: e.target.value }))}
                  />
                </Form.Group>
              </div>
            </div>
            <Form.Group>
              <Form.Label>Descripción</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={createForm.description}
                onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeCreateModal} disabled={createSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createSaving}>
              {createSaving ? "Creando..." : "Crear deal"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
      <Modal show={Boolean(activityDeal)} onHide={closeActivityModal} centered>
        <Form onSubmit={submitActivity}>
          <Modal.Header closeButton>
            <Modal.Title>Nueva actividad del deal</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            {activityError ? <Alert variant="danger" className="py-2 mb-0">{activityError}</Alert> : null}
            <div className="small text-muted">
              Deal: <strong className="text-body">{activityDeal?.title || activityDeal?.contact_name}</strong>
            </div>
            <Form.Group>
              <Form.Label>Asunto</Form.Label>
              <Form.Control
                required
                value={activityForm.subject}
                onChange={(e) => setActivityForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Tipo</Form.Label>
              <Form.Select
                value={activityForm.activity_type}
                onChange={(e) => setActivityForm((p) => ({ ...p, activity_type: e.target.value }))}
              >
                <option value="call">Llamada</option>
                <option value="meeting">Reunión</option>
                <option value="task">Tarea</option>
                <option value="email">Email</option>
                <option value="follow_up">Seguimiento</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="note">Nota</option>
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Fecha límite (opcional)</Form.Label>
              <Form.Control
                type="datetime-local"
                value={activityForm.due_date}
                onChange={(e) => setActivityForm((p) => ({ ...p, due_date: e.target.value }))}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Descripción</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={activityForm.description}
                onChange={(e) => setActivityForm((p) => ({ ...p, description: e.target.value }))}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={closeActivityModal} disabled={activitySaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={activitySaving}>
              {activitySaving ? "Guardando..." : "Crear actividad"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default DealsPipelinePage;
