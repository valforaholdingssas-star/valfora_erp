import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Button, Card, Form, Modal, Table } from "react-bootstrap";
import { arrayMove } from "@dnd-kit/sortable";
import { Link } from "react-router-dom";

import { createActivity, createDeal, fetchCompanies, fetchContacts, fetchDeals, moveDealStage } from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import PipelineColumn from "../components/PipelineColumn.jsx";
import { formatDealDisplayNumber, formatDealValue, resolveUserDisplayName } from "../utils/formatters.js";

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
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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
    if (assignedToFilter) params.assigned_to = assignedToFilter;
    Promise.all([fetchDeals(params), fetchContacts({ page_size: 200 }), fetchCompanies({ page_size: 200 }), fetchUsers({ page_size: 200, is_active: true })])
      .then(([data, contactsData, companiesData, usersData]) => {
        const userMap = new Map((usersData?.results || []).map((user) => [user.id, resolveUserDisplayName(user)]));
        const map = {};
        STAGES.forEach((s) => {
          map[s.id] = [];
        });
        (data.results || []).forEach((d) => {
          if (!map[d.stage]) map[d.stage] = [];
          map[d.stage].push({
            ...d,
            assigned_to_name: d.assigned_to_name || userMap.get(d.assigned_to) || "",
          });
        });
        setByStage(map);
        setContacts(contactsData || { results: [] });
        setCompanies(companiesData || { results: [] });
        setUsers(usersData || { results: [] });
        setError("");
      })
      .catch(() => setError("No se pudieron cargar los deals del pipeline."))
      .finally(() => setLoading(false));
  }, [assignedToFilter, companyFilter]);

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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesSearch = (deal) => {
    if (!normalizedQuery) return true;
    return [
      deal.title,
      deal.contact_name,
      deal.company_name,
      deal.assigned_to_name,
      deal.currency,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  };
  const visibleByStage = STAGES.reduce((acc, stage) => {
    acc[stage.id] = (byStage[stage.id] || []).filter(matchesSearch);
    return acc;
  }, {});
  const visibleDeals = STAGES.flatMap((stage) => visibleByStage[stage.id] || []);
  const totalPipelineValue = visibleDeals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);

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
          <p>Arrastra oportunidades entre etapas, gestiona seguimiento comercial y opera el embudo sin salir del flujo.</p>
        </div>
        <div className="crm-pipeline-header-actions">
          <div className="crm-view-switch" role="group" aria-label="Vista pipeline">
            <button
              type="button"
              className={viewMode === "canvas" ? "is-active" : ""}
              onClick={() => setViewMode("canvas")}
            >
              <i className="bi bi-kanban" />
              Canvas
            </button>
            <button
              type="button"
              className={viewMode === "table" ? "is-active" : ""}
              onClick={() => setViewMode("table")}
            >
              <i className="bi bi-table" />
              Tabla
            </button>
          </div>
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
            <Form.Select
              size="sm"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {(companies.results || []).map((co) => (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </Form.Select>
          </div>

          <div className="crm-toolbar-filter">
            <span>Asignado</span>
            <Form.Select
              size="sm"
              value={assignedToFilter}
              onChange={(e) => setAssignedToFilter(e.target.value)}
            >
              <option value="">Todos</option>
              {(users.results || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {resolveUserDisplayName(user)}
                </option>
              ))}
            </Form.Select>
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

      {error && (
        <Alert variant="danger" className="py-2 small mb-3">
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
          <div className="crm-pipeline-board-shell">
            <div className="crm-pipeline-board">
              {STAGES.map((stage) => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  deals={visibleByStage[stage.id] || []}
                  stageTotal={formatDealValue((visibleByStage[stage.id] || []).reduce((sum, deal) => sum + Number(deal.value || 0), 0))}
                  onCreateActivity={openActivityModal}
                  onCreateDeal={openCreateModalForStage}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeDeal ? (
              <Card className="shadow-sm crm-pipeline-drag-card">
                <Card.Body>
                  <div className="crm-pipeline-card-topline">
                    <span className="pipeline-chip pipeline-chip-neutral">Moviendo</span>
                    <span className="pipeline-chip pipeline-chip-company">{activeDeal.company_name || "Sin empresa"}</span>
                  </div>
                  <div className="crm-pipeline-drag-title">
                    {activeDeal.title || activeDeal.contact_name || `Deal ${activeDeal.id.slice(0, 8)}`}
                  </div>
                  <div className="crm-pipeline-drag-meta">
                    {formatDealValue(activeDeal.value)} {activeDeal.currency}
                  </div>
                  <div className="crm-pipeline-drag-contact">{activeDeal.contact_name}</div>
                </Card.Body>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="crm-pipeline-table-shell">
          <div className="crm-pipeline-table-wrap">
            <Table responsive className="crm-pipeline-table mb-0">
              <thead>
                <tr>
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
                    <td><span className="crm-table-pill">{formatDealDisplayNumber(deal.id, index)}</span></td>
                    <td>
                      <div className="crm-table-title">{deal.title || "Sin título"}</div>
                    </td>
                    <td>{deal.contact_name || "—"}</td>
                    <td>{deal.company_name || "Sin empresa"}</td>
                    <td>{deal.assigned_to_name || "Sin asignar"}</td>
                    <td>{formatDealValue(deal.value)} {deal.currency}</td>
                    <td><span className="crm-table-stage">{STAGES.find((s) => s.id === deal.stage)?.title || deal.stage}</span></td>
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
                    <td>
                      <div className="crm-table-actions">
                        <Button as={Link} to={`/crm/deals/${deal.id}`} size="sm" variant="outline-primary">
                          Editar
                        </Button>
                        <Button as={Link} to={`/chat/deal/${deal.id}`} size="sm" variant="outline-success">
                          Chat
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => openActivityModal(deal)}>
                          Actividad
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!visibleDeals.length ? (
                  <tr>
                    <td colSpan={9} className="text-muted text-center py-5">No hay deals para mostrar con los filtros actuales.</td>
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
