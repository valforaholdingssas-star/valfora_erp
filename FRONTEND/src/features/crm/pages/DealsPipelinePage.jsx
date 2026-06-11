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

import { createActivity, createDeal, fetchCompanies, fetchContacts, fetchDeals, moveDealStage } from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import PipelineColumn from "../components/PipelineColumn.jsx";
import { formatDealDisplayNumber, formatDealValue } from "../utils/formatters.js";

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
const MOVE_STAGE_OPTIONS = STAGES.filter((s) => s.id !== "qualification");

const DealsPipelinePage = () => {
  const [byStage, setByStage] = useState({});
  const [activeDeal, setActiveDeal] = useState(null);
  const [dragOriginStage, setDragOriginStage] = useState(null);
  const [activityDeal, setActivityDeal] = useState(null);
  const [viewMode, setViewMode] = useState("canvas");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contacts, setContacts] = useState({ results: [] });
  const [companies, setCompanies] = useState({ results: [] });
  const [users, setUsers] = useState({ results: [] });
  const [companyFilter, setCompanyFilter] = useState("");
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

  const load = useCallback(() => {
    const params = { page_size: 200 };
    if (companyFilter) params.company = companyFilter;
    Promise.all([fetchDeals(params), fetchContacts({ page_size: 200 }), fetchCompanies({ page_size: 200 }), fetchUsers({ page_size: 200, is_active: true })])
      .then(([data, contactsData, companiesData, usersData]) => {
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
        setCompanies(companiesData || { results: [] });
        setUsers(usersData || { results: [] });
        setError("");
      })
      .catch(() => setError("No se pudieron cargar los deals del pipeline."))
      .finally(() => setLoading(false));
  }, [companyFilter]);

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

  const extractApiError = (err, fallback) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (typeof err?.message === "string" && err.message.trim()) return err.message;
    return fallback;
  };

  const applyLocalStage = (dealId, toStageRaw) => {
    const toStage = toStageRaw === "qualification" ? "qualified" : toStageRaw;
    setByStage((prev) => {
      const fromStage = getStageForId(dealId, prev);
      if (!fromStage || fromStage === toStage) return prev;
      const source = [...(prev[fromStage] || [])];
      const idx = source.findIndex((d) => d.id === dealId);
      if (idx < 0) return prev;
      const [deal] = source.splice(idx, 1);
      const target = [...(prev[toStage] || [])];
      target.unshift({ ...deal, stage: toStage });
      return {
        ...prev,
        [fromStage]: source,
        [toStage]: target,
      };
    });
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
      setMovingDealId(activeId);
      await moveDealStage(activeId, { to_stage: newStage, notes: "Cambio manual desde pipeline canvas" });
      applyLocalStage(activeId, newStage);
      setError("");
    } catch (err) {
      setByStage(previousState);
      setError(extractApiError(err, "No se pudo mover el deal. Se revirtió el cambio."));
    } finally {
      setMovingDealId(null);
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
      stage: "new_lead",
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
      <div className="app-section-card p-2 mb-3 d-flex align-items-center gap-2">
        <span className="small text-muted">Empresa:</span>
        <Form.Select
          size="sm"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          style={{ maxWidth: 360 }}
        >
          <option value="">Todas</option>
          {(companies.results || []).map((co) => (
            <option key={co.id} value={co.id}>{co.name}</option>
          ))}
        </Form.Select>
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
                onCreateDeal={openCreateModalForStage}
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
                <th>#</th>
                <th>Deal</th>
                <th>Contacto</th>
                <th>Empresa</th>
                <th>Asignado</th>
                <th>Valor</th>
                <th>Etapa</th>
                <th style={{ width: 220 }}>Mover a</th>
                <th style={{ width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {allDeals.map((deal, index) => (
                <tr key={deal.id}>
                  <td>{formatDealDisplayNumber(deal.id, index)}</td>
                  <td>{deal.title}</td>
                  <td>{deal.contact_name || "—"}</td>
                  <td>{deal.company_name || "—"}</td>
                  <td>{deal.assigned_to_name || "Sin asignar"}</td>
                  <td>{formatDealValue(deal.value)} {deal.currency}</td>
                  <td>{deal.stage}</td>
                  <td>
                    <Form.Select
                      size="sm"
                      value={deal.stage}
                      disabled={movingDealId === deal.id}
                      onChange={async (e) => {
                        const toStage = e.target.value;
                        if (toStage === deal.stage) return;
                        const snapshot = structuredClone(byStage);
                        try {
                          setMovingDealId(deal.id);
                          await moveDealStage(deal.id, {
                            to_stage: toStage,
                            notes: "Cambio manual desde tabla",
                          });
                          applyLocalStage(deal.id, toStage);
                          setError("");
                        } catch (err) {
                          setByStage(snapshot);
                          setError(extractApiError(err, "No se pudo mover el deal."));
                        } finally {
                          setMovingDealId(null);
                        }
                      }}
                    >
                      {MOVE_STAGE_OPTIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </Form.Select>
                  </td>
                  <td className="d-flex gap-2">
                    <Button as={Link} to={`/crm/deals/${deal.id}`} size="sm" variant="outline-primary">
                      Editar
                    </Button>
                    <Button as={Link} to={`/chat/deal/${deal.id}`} size="sm" variant="outline-success">
                      Chat
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={() => openActivityModal(deal)}>
                      Actividad
                    </Button>
                  </td>
                </tr>
              ))}
              {!allDeals.length ? (
                <tr>
                  <td colSpan={9} className="text-muted">No hay deals para mostrar.</td>
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
                onChange={(e) => {
                  const contactId = e.target.value;
                  const selectedContact = (contacts.results || []).find((c) => c.id === contactId);
                  setCreateForm((p) => ({
                    ...p,
                    contact: contactId,
                    company: p.company || selectedContact?.company || "",
                  }));
                }}
              >
                <option value="">Selecciona un contacto</option>
                {(contacts.results || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} {c.email ? `· ${c.email}` : ""}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Empresa</Form.Label>
              <Form.Select
                value={createForm.company}
                onChange={(e) => setCreateForm((p) => ({ ...p, company: e.target.value }))}
              >
                <option value="">Sin empresa</option>
                {(companies.results || []).map((co) => (
                  <option key={co.id} value={co.id}>{co.name}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label>Asignado</Form.Label>
              <Form.Select
                value={createForm.assigned_to}
                onChange={(e) => setCreateForm((p) => ({ ...p, assigned_to: e.target.value }))}
              >
                <option value="">Automático: quien crea el deal</option>
                {(users.results || []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {[user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email}
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
              <Form.Label>Fecha límite</Form.Label>
              <Form.Control
                type="datetime-local"
                required
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
