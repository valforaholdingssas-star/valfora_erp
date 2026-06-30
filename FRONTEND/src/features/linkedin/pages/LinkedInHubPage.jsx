import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import { Navigate, useLocation } from "react-router-dom";
import PropTypes from "prop-types";

import {
  approveLinkedInProspect,
  connectLinkedInAccount,
  createLinkedInInvitationTemplate,
  createLinkedInMessageTemplate,
  createLinkedInProspect,
  createLinkedInSavedSearch,
  deleteLinkedInInvitationTemplate,
  deleteLinkedInMessageTemplate,
  deleteLinkedInSavedSearch,
  disconnectLinkedInAccount,
  executeLinkedInSavedSearch,
  fetchLinkedInAccountStatus,
  fetchLinkedInDashboard,
  fetchLinkedInInvitationTemplates,
  fetchLinkedInMessageConversationDetail,
  fetchLinkedInMessageConversations,
  fetchLinkedInMessageTemplates,
  fetchLinkedInProspects,
  fetchLinkedInSavedSearches,
  inviteLinkedInProspect,
  markLinkedInConversationRead,
  moveLinkedInProspectStage,
  sendLinkedInMessage,
  startLinkedInMessage,
  updateLinkedInProspect,
} from "../../../api/linkedin.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";
import { useNotifications } from "../../../contexts/NotificationContext.jsx";

const STAGE_LABELS = {
  contacted: "Contactado",
  low_interest: "Interés bajo",
  high_interest: "Interés alto",
  meeting_scheduling: "En agendamiento",
  proposal_sent: "Propuesta enviada",
  no_response: "No contesta",
  discarded: "Descartado",
};

const STAGE_OPTIONS = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));

const NETWORK_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "first", label: "1er grado" },
  { value: "second", label: "2do grado" },
  { value: "third", label: "3er grado" },
  { value: "out_of_network", label: "Fuera de red" },
];

const INVITE_STATUS_STYLE = {
  not_sent: "secondary",
  pending: "warning",
  accepted: "success",
  declined: "danger",
  withdrawn: "dark",
};

const parseApiError = (err, fallback) => {
  const d = err?.response?.data;
  if (typeof d?.message === "string" && d.message.trim()) return d.message;
  if (typeof d?.detail === "string" && d.detail.trim()) return d.detail;
  if (d && typeof d === "object") {
    const first = Object.keys(d)[0];
    const value = first ? d[first] : null;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};

const LinkedInHubPage = ({ focus = "all" }) => {
  const { hasModuleAccess } = useAuth();
  const { linkedinUnreadCount } = useNotifications();
  const location = useLocation();
  const canView = hasModuleAccess("linkedin", "view");
  const canEdit = hasModuleAccess("linkedin", "edit");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [account, setAccount] = useState({ connected: false, account: null });
  const [dashboard, setDashboard] = useState({ funnel: [], stale_prospects: 0, invitations_week: 0, active_saved_searches: 0 });
  const [searches, setSearches] = useState([]);
  const [prospects, setProspects] = useState([]);
  const [templates, setTemplates] = useState({ invitations: [], messages: [] });
  const [messageProspects, setMessageProspects] = useState([]);
  const [selectedMessageProspectId, setSelectedMessageProspectId] = useState(null);
  const [messageThread, setMessageThread] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageLoading, setMessageLoading] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    funnel_stage: "",
    invitation_status: "",
    network_distance: "",
    page_size: 50,
  });

  const [searchForm, setSearchForm] = useState({
    name: "",
    keywords: "",
    job_title: "",
    industry: "",
    location: "",
    network_distance: "",
    frequency: "daily",
  });

  const [prospectForm, setProspectForm] = useState({
    linkedin_profile_id: "",
    full_name: "",
    linkedin_profile_url: "",
    headline: "",
    company_name: "",
    job_title: "",
    location: "",
    network_distance: "out_of_network",
    tags: "",
    notes: "",
    conversation_summary: "",
    product_interest: "",
    opportunity_value: "",
    opportunity_currency: "USD",
  });

  const [inviteDraft, setInviteDraft] = useState({});
  const [stageDraft, setStageDraft] = useState({});
  const [editingInfoId, setEditingInfoId] = useState(null);
  const [editingInfo, setEditingInfo] = useState({
    notes: "",
    conversation_summary: "",
    product_interest: "",
    opportunity_value: "",
    opportunity_currency: "USD",
  });

  const [invitationTemplateForm, setInvitationTemplateForm] = useState({ name: "", body: "" });
  const [messageTemplateForm, setMessageTemplateForm] = useState({ name: "", body: "" });

  const [runningSearchId, setRunningSearchId] = useState(null);
  const [actionLoadingKey, setActionLoadingKey] = useState("");

  const loadAll = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [accountData, dashboardData, searchesData, prospectsData, invitationTemplates, messageTemplates] = await Promise.all([
        fetchLinkedInAccountStatus(),
        fetchLinkedInDashboard().catch(() => ({ funnel: [], stale_prospects: 0, invitations_week: 0, active_saved_searches: 0 })),
        fetchLinkedInSavedSearches({ page_size: 100 }),
        fetchLinkedInProspects(filters),
        fetchLinkedInInvitationTemplates({ page_size: 100 }),
        fetchLinkedInMessageTemplates({ page_size: 100 }),
      ]);
      setAccount(accountData || { connected: false, account: null });
      setDashboard(dashboardData || { funnel: [], stale_prospects: 0, invitations_week: 0, active_saved_searches: 0 });
      setSearches(searchesData.results || []);
      setProspects(prospectsData.results || []);
      setTemplates({
        invitations: invitationTemplates.results || [],
        messages: messageTemplates.results || [],
      });

      const [messageConversations] = await Promise.all([
        fetchLinkedInMessageConversations().catch(() => ({ results: [] })),
      ]);
      const nextMessageProspects = messageConversations.results || [];
      setMessageProspects(nextMessageProspects);
      setSelectedMessageProspectId((prev) => {
        if (prev && nextMessageProspects.some((row) => row.id === prev)) return prev;
        return nextMessageProspects[0]?.id || null;
      });
    } catch (err) {
      setError(parseApiError(err, "No se pudo cargar el módulo de LinkedIn."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    if (canView) {
      void loadAll();
    }
  }, [canView, loadAll]);

  const loadConversationDetail = useCallback(async (prospectId) => {
    if (!prospectId) {
      setMessageThread([]);
      return;
    }
    setMessageLoading(true);
    try {
      const detail = await fetchLinkedInMessageConversationDetail(prospectId, { limit: 100 });
      const rawMessages = detail.items || detail.results || detail.messages || [];
      const normalized = rawMessages.map((m, idx) => ({
        id: m.id || m.message_id || `${prospectId}-${idx}`,
        text: m.text || m.body || m.content || m.message || "",
        created_at: m.created_at || m.timestamp || m.date || null,
        direction:
          m.direction ||
          (m.sender?.is_me || m.is_from_me || m.outbound ? "outbound" : "inbound"),
      }));
      setMessageThread(normalized);
    } catch {
      setMessageThread([]);
    } finally {
      setMessageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedMessageProspectId) {
      setMessageThread([]);
      return;
    }
    void loadConversationDetail(selectedMessageProspectId);
    void markLinkedInConversationRead(selectedMessageProspectId).catch(() => {});
  }, [loadConversationDetail, selectedMessageProspectId]);

  useEffect(() => {
    if (!canView) return;
    void fetchLinkedInMessageConversations()
      .then((data) => {
        const list = data.results || [];
        setMessageProspects(list);
        if (selectedMessageProspectId) return;
        const fromUrl = new URLSearchParams(location.search).get("prospect");
        if (fromUrl && list.some((row) => row.id === fromUrl)) {
          setSelectedMessageProspectId(fromUrl);
          return;
        }
        setSelectedMessageProspectId(list[0]?.id || null);
      })
      .catch(() => {});
    if (selectedMessageProspectId) {
      void loadConversationDetail(selectedMessageProspectId);
    }
  }, [canView, linkedinUnreadCount, loadConversationDetail, location.search, selectedMessageProspectId]);

  const funnelCounters = useMemo(() => {
    const base = Object.keys(STAGE_LABELS).reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {});
    for (const item of dashboard.funnel || []) {
      if (base[item.funnel_stage] !== undefined) base[item.funnel_stage] = item.count || 0;
    }
    return base;
  }, [dashboard.funnel]);

  if (!canView) return <Navigate to="/" replace />;
  const showBlock = (name) => focus === "all" || focus === name;

  const handleConnect = async () => {
    setActionLoadingKey("connect");
    setError("");
    setSuccess("");
    try {
      const callback = `${window.location.origin}/settings/linkedin`;
      const data = await connectLinkedInAccount({ callback_url: callback });
      const authUrl = data?.auth_url || data?.url;
      if (authUrl) {
        window.open(authUrl, "_blank", "noopener,noreferrer");
        setSuccess("Se abrió la ventana de conexión de LinkedIn/Unipile.");
      } else {
        setSuccess("Solicitud de conexión enviada.");
      }
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo iniciar la conexión de LinkedIn."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleDisconnect = async () => {
    setActionLoadingKey("disconnect");
    setError("");
    setSuccess("");
    try {
      await disconnectLinkedInAccount();
      setSuccess("Cuenta LinkedIn desconectada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo desconectar la cuenta."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleCreateSearch = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setActionLoadingKey("create-search");
    setError("");
    setSuccess("");
    try {
      await createLinkedInSavedSearch(searchForm);
      setSearchForm({
        name: "",
        keywords: "",
        job_title: "",
        industry: "",
        location: "",
        network_distance: "",
        frequency: "daily",
      });
      setSuccess("Búsqueda guardada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo guardar la búsqueda."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleExecuteSearch = async (id) => {
    setRunningSearchId(id);
    setError("");
    setSuccess("");
    try {
      const res = await executeLinkedInSavedSearch(id, { limit: 25 });
      setSuccess(`Búsqueda ejecutada. Prospectos nuevos: ${res.created ?? 0}.`);
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo ejecutar la búsqueda."));
    } finally {
      setRunningSearchId(null);
    }
  };

  const handleDeleteSearch = async (id) => {
    if (!window.confirm("¿Eliminar búsqueda guardada?")) return;
    setActionLoadingKey(`delete-search-${id}`);
    setError("");
    setSuccess("");
    try {
      await deleteLinkedInSavedSearch(id);
      setSuccess("Búsqueda eliminada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo eliminar la búsqueda."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleCreateProspect = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setActionLoadingKey("create-prospect");
    setError("");
    setSuccess("");
    try {
      await createLinkedInProspect({
        ...prospectForm,
        opportunity_value:
          prospectForm.opportunity_value === "" || prospectForm.opportunity_value == null
            ? null
            : Number(prospectForm.opportunity_value),
        tags: prospectForm.tags
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      });
      setProspectForm({
        linkedin_profile_id: "",
        full_name: "",
        linkedin_profile_url: "",
        headline: "",
        company_name: "",
        job_title: "",
        location: "",
        network_distance: "out_of_network",
        tags: "",
        notes: "",
        conversation_summary: "",
        product_interest: "",
        opportunity_value: "",
        opportunity_currency: "USD",
      });
      setSuccess("Prospecto agregado.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo crear el prospecto."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleInvite = async (prospectId) => {
    setActionLoadingKey(`invite-${prospectId}`);
    setError("");
    setSuccess("");
    try {
      await inviteLinkedInProspect(prospectId, { message: inviteDraft[prospectId] || "" });
      setInviteDraft((prev) => ({ ...prev, [prospectId]: "" }));
      setSuccess("Invitación enviada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo enviar la invitación."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleMoveStage = async (prospectId) => {
    const toStage = stageDraft[prospectId];
    if (!toStage) return;
    setActionLoadingKey(`move-${prospectId}`);
    setError("");
    setSuccess("");
    try {
      await moveLinkedInProspectStage(prospectId, { to_stage: toStage });
      setSuccess("Etapa actualizada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo mover la etapa."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleDiscardOrApprove = async (prospectId, isDiscarded) => {
    setActionLoadingKey(`${isDiscarded ? "approve" : "discard"}-${prospectId}`);
    setError("");
    setSuccess("");
    try {
      if (isDiscarded) {
        await approveLinkedInProspect(prospectId);
        setSuccess("Prospecto reactivado.");
      } else {
        await moveLinkedInProspectStage(prospectId, { to_stage: "discarded", reason: "Descartado manualmente" });
        setSuccess("Prospecto descartado.");
      }
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo actualizar el estado del prospecto."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleSaveProspectInfo = async (prospectId) => {
    setActionLoadingKey(`prospect-info-${prospectId}`);
    setError("");
    setSuccess("");
    try {
      await updateLinkedInProspect(prospectId, {
        notes: editingInfo.notes,
        conversation_summary: editingInfo.conversation_summary,
        product_interest: editingInfo.product_interest,
        opportunity_value:
          editingInfo.opportunity_value === "" || editingInfo.opportunity_value == null
            ? null
            : Number(editingInfo.opportunity_value),
        opportunity_currency: (editingInfo.opportunity_currency || "USD").toUpperCase(),
      });
      setEditingInfoId(null);
      setSuccess("Ficha comercial actualizada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo guardar la ficha comercial."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleCreateInvitationTemplate = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setActionLoadingKey("create-inv-template");
    setError("");
    setSuccess("");
    try {
      await createLinkedInInvitationTemplate(invitationTemplateForm);
      setInvitationTemplateForm({ name: "", body: "" });
      setSuccess("Plantilla de invitación creada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo crear la plantilla de invitación."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleCreateMessageTemplate = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setActionLoadingKey("create-msg-template");
    setError("");
    setSuccess("");
    try {
      await createLinkedInMessageTemplate(messageTemplateForm);
      setMessageTemplateForm({ name: "", body: "" });
      setSuccess("Plantilla de mensaje creada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo crear la plantilla de mensaje."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const handleDeleteTemplate = async (type, id) => {
    if (!window.confirm("¿Eliminar plantilla?")) return;
    setActionLoadingKey(`delete-template-${id}`);
    setError("");
    setSuccess("");
    try {
      if (type === "invitation") await deleteLinkedInInvitationTemplate(id);
      else await deleteLinkedInMessageTemplate(id);
      setSuccess("Plantilla eliminada.");
      await loadAll(true);
    } catch (err) {
      setError(parseApiError(err, "No se pudo eliminar la plantilla."));
    } finally {
      setActionLoadingKey("");
    }
  };

  const selectedMessageProspect = useMemo(
    () => messageProspects.find((p) => p.id === selectedMessageProspectId) || null,
    [messageProspects, selectedMessageProspectId],
  );

  const handleSendLinkedInMessage = async (e) => {
    e.preventDefault();
    if (!selectedMessageProspectId || !messageDraft.trim() || !canEdit) return;
    setActionLoadingKey(`send-li-msg-${selectedMessageProspectId}`);
    setError("");
    setSuccess("");
    try {
      const payload = { text: messageDraft.trim() };
      if (selectedMessageProspect?.unipile_chat_id) {
        await sendLinkedInMessage(selectedMessageProspectId, payload);
      } else {
        await startLinkedInMessage(selectedMessageProspectId, payload);
      }
      setMessageDraft("");
      setSuccess("Mensaje enviado.");
      await Promise.all([loadConversationDetail(selectedMessageProspectId), loadAll(true)]);
    } catch (err) {
      setError(parseApiError(err, "No se pudo enviar el mensaje."));
    } finally {
      setActionLoadingKey("");
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">LinkedIn</div>
          <h1 className="h3 mb-1">Outreach comercial</h1>
          <p className="text-muted mb-0">Prospección, embudo e invitaciones conectadas a Unipile.</p>
        </div>
        <div className="app-action-cluster">
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={() => void loadAll(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? "Actualizando..." : "Recargar"}
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      ) : (
        <>
          <div className="app-kpi-grid mb-4">
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Estado cuenta</span>
              <strong className="app-kpi-value">{account.connected ? "Conectada" : "Sin conectar"}</strong>
              <span className="text-muted small">{account.account?.linkedin_name || "Configura tu cuenta LinkedIn"}</span>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Invitaciones (7 días)</span>
              <strong className="app-kpi-value">{dashboard.invitations_week || 0}</strong>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Sin respuesta</span>
              <strong className="app-kpi-value">{dashboard.stale_prospects || 0}</strong>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Búsquedas activas</span>
              <strong className="app-kpi-value">{dashboard.active_saved_searches || 0}</strong>
            </div>
          </div>

          {showBlock("account") && (
          <Card className="app-card app-section-card mb-4">
            <Card.Body>
              <div className="app-surface-header">
                <div>
                  <div className="app-eyebrow">Cuenta</div>
                  <h2 className="h6 mb-1">Conexión LinkedIn</h2>
                  <p className="text-muted small mb-0">Conecta una cuenta para habilitar búsquedas, invitaciones y mensajes.</p>
                </div>
                {account.connected ? (
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => void handleDisconnect()}
                    disabled={!canEdit || actionLoadingKey === "disconnect"}
                  >
                    Desconectar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void handleConnect()}
                    disabled={!canEdit || actionLoadingKey === "connect"}
                  >
                    Conectar LinkedIn
                  </Button>
                )}
              </div>
              <div className="small text-muted">
                Estado:{" "}
                <Badge bg={account.connected ? "success" : "secondary"}>
                  {account.account?.status || (account.connected ? "active" : "disconnected")}
                </Badge>
              </div>
            </Card.Body>
          </Card>
          )}

          {showBlock("dashboard") && (
          <Card className="app-card app-section-card mb-4">
            <Card.Body>
              <div className="app-surface-header">
                <div>
                  <div className="app-eyebrow">Pipeline</div>
                  <h2 className="h6 mb-0">Embudo LinkedIn</h2>
                </div>
              </div>
              <Row className="g-2">
                {STAGE_OPTIONS.map((stage) => (
                  <Col key={stage.value} md={4} xl={3}>
                    <div className="app-surface-subtile-border rounded-3 p-3 h-100">
                      <div className="small text-uppercase text-muted">{stage.label}</div>
                      <div className="h5 mb-0">{funnelCounters[stage.value] || 0}</div>
                    </div>
                  </Col>
                ))}
              </Row>
            </Card.Body>
          </Card>
          )}

          {showBlock("searches_templates") && (
          <Row className="g-4 mb-4">
            <Col xl={6}>
              <Card className="app-card app-section-card h-100">
                <Card.Body>
                  <div className="app-surface-header">
                    <div>
                      <div className="app-eyebrow">Automatización</div>
                      <h2 className="h6 mb-0">Búsquedas guardadas</h2>
                    </div>
                  </div>
                  <Form onSubmit={handleCreateSearch} className="mb-3">
                    <Row className="g-2">
                      <Col md={6}>
                        <Form.Control
                          placeholder="Nombre"
                          value={searchForm.name}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </Col>
                      <Col md={6}>
                        <Form.Control
                          placeholder="Keywords"
                          value={searchForm.keywords}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, keywords: e.target.value }))}
                          required
                        />
                      </Col>
                      <Col md={4}>
                        <Form.Control
                          placeholder="Cargo"
                          value={searchForm.job_title}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, job_title: e.target.value }))}
                        />
                      </Col>
                      <Col md={4}>
                        <Form.Control
                          placeholder="Industria"
                          value={searchForm.industry}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, industry: e.target.value }))}
                        />
                      </Col>
                      <Col md={4}>
                        <Form.Control
                          placeholder="Ubicación"
                          value={searchForm.location}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, location: e.target.value }))}
                        />
                      </Col>
                      <Col md={6}>
                        <Form.Select
                          value={searchForm.network_distance}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, network_distance: e.target.value }))}
                        >
                          {NETWORK_OPTIONS.map((opt) => (
                            <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col md={6}>
                        <Form.Select
                          value={searchForm.frequency}
                          onChange={(e) => setSearchForm((prev) => ({ ...prev, frequency: e.target.value }))}
                        >
                          <option value="daily">Diaria</option>
                          <option value="every_2_days">Cada 2 días</option>
                          <option value="weekly">Semanal</option>
                        </Form.Select>
                      </Col>
                      <Col xs={12}>
                        <Button type="submit" size="sm" disabled={!canEdit || actionLoadingKey === "create-search"}>
                          Guardar búsqueda
                        </Button>
                      </Col>
                    </Row>
                  </Form>
                  <div className="app-table-shell">
                    <Table responsive hover size="sm" className="mb-0 app-table-clean">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Keywords</th>
                        <th>Frecuencia</th>
                        <th>Resultados</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {searches.length === 0 && (
                        <tr><td colSpan={5} className="text-muted">Sin búsquedas guardadas.</td></tr>
                      )}
                      {searches.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.keywords}</td>
                          <td>{row.frequency}</td>
                          <td>{row.total_results_found || 0}</td>
                          <td className="text-nowrap">
                            <Button
                              size="sm"
                              variant="outline-primary"
                              className="me-1"
                              disabled={!canEdit || runningSearchId === row.id}
                              onClick={() => void handleExecuteSearch(row.id)}
                            >
                              {runningSearchId === row.id ? "Ejecutando..." : "Ejecutar"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              disabled={!canEdit || actionLoadingKey === `delete-search-${row.id}`}
                              onClick={() => void handleDeleteSearch(row.id)}
                            >
                              Eliminar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  </div>
                </Card.Body>
              </Card>
            </Col>

            <Col xl={6}>
              <Card className="app-card app-section-card h-100">
                <Card.Body>
                  <div className="app-surface-header">
                    <div>
                      <div className="app-eyebrow">Mensajería</div>
                      <h2 className="h6 mb-0">Plantillas</h2>
                    </div>
                  </div>
                  <Row className="g-3">
                    <Col md={6}>
                      <Form onSubmit={handleCreateInvitationTemplate}>
                        <h3 className="h6">Invitaciones</h3>
                        <Form.Control
                          className="mb-2"
                          placeholder="Nombre"
                          value={invitationTemplateForm.name}
                          onChange={(e) => setInvitationTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                          required
                        />
                        <Form.Control
                          as="textarea"
                          rows={3}
                          className="mb-2"
                          maxLength={300}
                          placeholder="Mensaje (máx. 300)"
                          value={invitationTemplateForm.body}
                          onChange={(e) => setInvitationTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
                          required
                        />
                        <Button size="sm" type="submit" disabled={!canEdit || actionLoadingKey === "create-inv-template"}>
                          Guardar
                        </Button>
                      </Form>
                      <div className="mt-2 d-flex flex-column gap-2">
                        {templates.invitations.map((tpl) => (
                          <div key={tpl.id} className="border rounded p-2 small">
                            <div className="fw-semibold">{tpl.name}</div>
                            <div className="text-muted mb-1">{tpl.body}</div>
                            <Button size="sm" variant="outline-danger" onClick={() => void handleDeleteTemplate("invitation", tpl.id)}>
                              Eliminar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Col>
                    <Col md={6}>
                      <Form onSubmit={handleCreateMessageTemplate}>
                        <h3 className="h6">Mensajes</h3>
                        <Form.Control
                          className="mb-2"
                          placeholder="Nombre"
                          value={messageTemplateForm.name}
                          onChange={(e) => setMessageTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                          required
                        />
                        <Form.Control
                          as="textarea"
                          rows={3}
                          className="mb-2"
                          placeholder="Mensaje inicial"
                          value={messageTemplateForm.body}
                          onChange={(e) => setMessageTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
                          required
                        />
                        <Button size="sm" type="submit" disabled={!canEdit || actionLoadingKey === "create-msg-template"}>
                          Guardar
                        </Button>
                      </Form>
                      <div className="mt-2 d-flex flex-column gap-2">
                        {templates.messages.map((tpl) => (
                          <div key={tpl.id} className="border rounded p-2 small">
                            <div className="fw-semibold">{tpl.name}</div>
                            <div className="text-muted mb-1">{tpl.body}</div>
                            <Button size="sm" variant="outline-danger" onClick={() => void handleDeleteTemplate("message", tpl.id)}>
                              Eliminar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>
          </Row>
          )}

          {showBlock("inbox") && (
          <Card className="app-card app-section-card mb-4">
            <Card.Body>
              <div className="app-surface-header">
                <div>
                  <div className="app-eyebrow">Conversaciones</div>
                  <h2 className="h6 mb-0">Inbox LinkedIn</h2>
                </div>
                <div className="d-flex align-items-center gap-2 small">
                  <span className="text-muted">No leídos:</span>
                  <Badge className={linkedinUnreadCount > 0 ? "app-badge-soft-warning" : "app-badge-soft"}>
                    {linkedinUnreadCount}
                  </Badge>
                </div>
              </div>
              <Row className="g-3">
                <Col lg={4}>
                  <div className="border rounded-3 p-2" style={{ maxHeight: 460, overflowY: "auto" }}>
                    {messageProspects.length === 0 && (
                      <p className="text-muted small mb-0">No hay conversaciones LinkedIn iniciadas.</p>
                    )}
                    {messageProspects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`btn btn-sm text-start w-100 mb-1 ${selectedMessageProspectId === p.id ? "btn-primary" : "btn-light"}`}
                        onClick={() => setSelectedMessageProspectId(p.id)}
                      >
                        <div className="fw-semibold">{p.full_name}</div>
                        <div className="small opacity-75">{p.company_name || p.headline || "-"}</div>
                      </button>
                    ))}
                  </div>
                </Col>
                <Col lg={8}>
                  <div className="border rounded-3 p-3 d-flex flex-column" style={{ minHeight: 460 }}>
                    {selectedMessageProspect ? (
                      <>
                        <div className="mb-2">
                          <div className="fw-semibold">{selectedMessageProspect.full_name}</div>
                          <div className="small text-muted">
                            {selectedMessageProspect.job_title || selectedMessageProspect.headline || "-"}
                          </div>
                        </div>
                        <div className="flex-grow-1 border rounded-2 p-2 mb-2" style={{ overflowY: "auto", maxHeight: 320 }}>
                          {messageLoading && <p className="small text-muted mb-0">Cargando conversación...</p>}
                          {!messageLoading && messageThread.length === 0 && (
                            <p className="small text-muted mb-0">Sin mensajes todavía.</p>
                          )}
                          {messageThread.map((msg) => (
                            <div
                              key={msg.id}
                              className={`d-flex mb-2 ${msg.direction === "outbound" ? "justify-content-end" : "justify-content-start"}`}
                            >
                              <div
                                className={`px-2 py-1 rounded-2 small ${msg.direction === "outbound" ? "bg-primary text-white" : "bg-light text-dark"}`}
                                style={{ maxWidth: "78%" }}
                              >
                                <div>{msg.text || "-"}</div>
                                <div className={`mt-1 ${msg.direction === "outbound" ? "text-white-50" : "text-muted"}`} style={{ fontSize: "11px" }}>
                                  {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <Form onSubmit={handleSendLinkedInMessage}>
                          <div className="d-flex gap-2">
                            <Form.Control
                              value={messageDraft}
                              onChange={(e) => setMessageDraft(e.target.value)}
                              placeholder="Escribe un mensaje..."
                            />
                            <Button
                              type="submit"
                              disabled={!canEdit || !messageDraft.trim() || actionLoadingKey === `send-li-msg-${selectedMessageProspectId}`}
                            >
                              Enviar
                            </Button>
                          </div>
                        </Form>
                      </>
                    ) : (
                      <p className="text-muted mb-0">Selecciona una conversación.</p>
                    )}
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
          )}

          {showBlock("prospects") && (
          <Card className="app-card app-section-card mb-4">
            <Card.Body>
              <div className="app-surface-header">
                <div>
                  <div className="app-eyebrow">Captura</div>
                  <h2 className="h6 mb-0">Agregar prospecto manual</h2>
                </div>
              </div>
              <Form onSubmit={handleCreateProspect}>
                <Row className="g-2">
                  <Col md={3}>
                    <Form.Control
                      placeholder="Profile ID (URN)"
                      value={prospectForm.linkedin_profile_id}
                      onChange={(e) => setProspectForm((prev) => ({ ...prev, linkedin_profile_id: e.target.value }))}
                      required
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Control
                      placeholder="Nombre completo"
                      value={prospectForm.full_name}
                      onChange={(e) => setProspectForm((prev) => ({ ...prev, full_name: e.target.value }))}
                      required
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Control
                      placeholder="URL perfil"
                      value={prospectForm.linkedin_profile_url}
                      onChange={(e) => setProspectForm((prev) => ({ ...prev, linkedin_profile_url: e.target.value }))}
                    />
                  </Col>
                  <Col md={3}>
                    <Form.Select
                      value={prospectForm.network_distance}
                      onChange={(e) => setProspectForm((prev) => ({ ...prev, network_distance: e.target.value }))}
                    >
                      {NETWORK_OPTIONS.filter((opt) => opt.value).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={3}><Form.Control placeholder="Headline" value={prospectForm.headline} onChange={(e) => setProspectForm((prev) => ({ ...prev, headline: e.target.value }))} /></Col>
                  <Col md={3}><Form.Control placeholder="Empresa" value={prospectForm.company_name} onChange={(e) => setProspectForm((prev) => ({ ...prev, company_name: e.target.value }))} /></Col>
                  <Col md={3}><Form.Control placeholder="Cargo" value={prospectForm.job_title} onChange={(e) => setProspectForm((prev) => ({ ...prev, job_title: e.target.value }))} /></Col>
                  <Col md={3}><Form.Control placeholder="Ubicación" value={prospectForm.location} onChange={(e) => setProspectForm((prev) => ({ ...prev, location: e.target.value }))} /></Col>
                  <Col md={6}><Form.Control placeholder="Tags (separadas por coma)" value={prospectForm.tags} onChange={(e) => setProspectForm((prev) => ({ ...prev, tags: e.target.value }))} /></Col>
                  <Col md={6}><Form.Control placeholder="Notas" value={prospectForm.notes} onChange={(e) => setProspectForm((prev) => ({ ...prev, notes: e.target.value }))} /></Col>
                  <Col md={6}><Form.Control placeholder="Producto de interés" value={prospectForm.product_interest} onChange={(e) => setProspectForm((prev) => ({ ...prev, product_interest: e.target.value }))} /></Col>
                  <Col md={3}><Form.Control type="number" step="0.01" min="0" placeholder="Valor oportunidad" value={prospectForm.opportunity_value} onChange={(e) => setProspectForm((prev) => ({ ...prev, opportunity_value: e.target.value }))} /></Col>
                  <Col md={3}><Form.Control placeholder="Moneda (USD/COP)" value={prospectForm.opportunity_currency} onChange={(e) => setProspectForm((prev) => ({ ...prev, opportunity_currency: e.target.value.toUpperCase() }))} /></Col>
                  <Col md={12}><Form.Control as="textarea" rows={2} placeholder="Resumen conversación" value={prospectForm.conversation_summary} onChange={(e) => setProspectForm((prev) => ({ ...prev, conversation_summary: e.target.value }))} /></Col>
                  <Col xs={12}>
                    <Button size="sm" type="submit" disabled={!canEdit || actionLoadingKey === "create-prospect"}>
                      Crear prospecto
                    </Button>
                  </Col>
                </Row>
              </Form>
            </Card.Body>
          </Card>
          )}

          {showBlock("prospects") && (
          <Card className="app-card app-section-card">
            <Card.Body>
              <div className="app-surface-header flex-wrap">
                <div>
                  <div className="app-eyebrow">Base comercial</div>
                  <h2 className="h6 mb-0">Prospectos</h2>
                </div>
                <Form className="d-flex gap-2 flex-wrap">
                  <Form.Control
                    size="sm"
                    placeholder="Buscar"
                    value={filters.search}
                    onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  />
                  <Form.Select size="sm" value={filters.funnel_stage} onChange={(e) => setFilters((prev) => ({ ...prev, funnel_stage: e.target.value }))}>
                    <option value="">Etapa: todas</option>
                    {STAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Form.Select>
                  <Form.Select size="sm" value={filters.invitation_status} onChange={(e) => setFilters((prev) => ({ ...prev, invitation_status: e.target.value }))}>
                    <option value="">Invitación: todas</option>
                    <option value="not_sent">No enviada</option>
                    <option value="pending">Pendiente</option>
                    <option value="accepted">Aceptada</option>
                    <option value="declined">Rechazada</option>
                    <option value="withdrawn">Retirada</option>
                  </Form.Select>
                  <Button size="sm" variant="outline-secondary" onClick={() => void loadAll(true)}>
                    Aplicar
                  </Button>
                </Form>
              </div>
              <div className="app-table-shell">
                <Table responsive hover size="sm" className="mb-0 app-table-clean">
                <thead>
                  <tr>
                    <th>Prospecto</th>
                    <th>Empresa</th>
                    <th>Etapa</th>
                    <th>Oportunidad</th>
                    <th>Invitación</th>
                    <th>Mensaje invitación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.length === 0 && (
                    <tr><td colSpan={7} className="text-muted">No hay prospectos para los filtros actuales.</td></tr>
                  )}
                  {prospects.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="fw-semibold">{p.full_name}</div>
                        <div className="small text-muted">{p.job_title || p.headline || "-"}</div>
                        {p.linkedin_profile_url ? (
                          <a href={p.linkedin_profile_url} target="_blank" rel="noreferrer" className="small">
                            Ver perfil
                          </a>
                        ) : null}
                      </td>
                      <td>{p.company_name || "-"}</td>
                      <td>
                        <Badge bg="light" text="dark">{STAGE_LABELS[p.funnel_stage] || p.funnel_stage}</Badge>
                        <Form.Select
                          size="sm"
                          className="mt-1"
                          value={stageDraft[p.id] || ""}
                          onChange={(e) => setStageDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        >
                          <option value="">Mover a...</option>
                          {STAGE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </Form.Select>
                      </td>
                      <td style={{ minWidth: 190 }}>
                        <div className="small"><strong>Producto:</strong> {p.product_interest || "-"}</div>
                        <div className="small"><strong>Valor:</strong> {p.opportunity_value || "-"} {p.opportunity_currency || ""}</div>
                      </td>
                      <td>
                        <Badge bg={INVITE_STATUS_STYLE[p.invitation_status] || "secondary"}>
                          {p.invitation_status}
                        </Badge>
                      </td>
                      <td style={{ minWidth: 240 }}>
                        <Form.Control
                          size="sm"
                          placeholder="Mensaje opcional"
                          value={inviteDraft[p.id] || ""}
                          onChange={(e) => setInviteDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          disabled={p.invitation_status !== "not_sent"}
                        />
                      </td>
                      <td style={{ minWidth: 270 }}>
                        <div className="d-flex gap-1 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline-primary"
                            disabled={!canEdit || p.invitation_status !== "not_sent" || actionLoadingKey === `invite-${p.id}`}
                            onClick={() => void handleInvite(p.id)}
                          >
                            Invitar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            disabled={!canEdit || !stageDraft[p.id] || actionLoadingKey === `move-${p.id}`}
                            onClick={() => void handleMoveStage(p.id)}
                          >
                            Mover etapa
                          </Button>
                          <Button
                            size="sm"
                            variant={p.is_discarded ? "outline-success" : "outline-danger"}
                            disabled={!canEdit || actionLoadingKey === `${p.is_discarded ? "approve" : "discard"}-${p.id}`}
                            onClick={() => void handleDiscardOrApprove(p.id, p.is_discarded)}
                          >
                            {p.is_discarded ? "Reactivar" : "Descartar"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-dark"
                            onClick={() => {
                              setEditingInfoId(p.id);
                              setEditingInfo({
                                notes: p.notes || "",
                                conversation_summary: p.conversation_summary || "",
                                product_interest: p.product_interest || "",
                                opportunity_value: p.opportunity_value ?? "",
                                opportunity_currency: p.opportunity_currency || "USD",
                              });
                            }}
                          >
                            Ficha
                          </Button>
                        </div>
                        {editingInfoId === p.id && (
                          <div className="mt-2">
                            <Form.Control
                              className="mb-1"
                              placeholder="Producto de interés"
                              value={editingInfo.product_interest}
                              onChange={(e) => setEditingInfo((prev) => ({ ...prev, product_interest: e.target.value }))}
                            />
                            <div className="d-flex gap-1 mb-1">
                              <Form.Control
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Valor oportunidad"
                                value={editingInfo.opportunity_value}
                                onChange={(e) => setEditingInfo((prev) => ({ ...prev, opportunity_value: e.target.value }))}
                              />
                              <Form.Control
                                placeholder="Moneda"
                                value={editingInfo.opportunity_currency}
                                onChange={(e) =>
                                  setEditingInfo((prev) => ({ ...prev, opportunity_currency: e.target.value.toUpperCase() }))
                                }
                              />
                            </div>
                            <Form.Control
                              className="mb-1"
                              as="textarea"
                              rows={2}
                              placeholder="Resumen de conversaciones"
                              value={editingInfo.conversation_summary}
                              onChange={(e) =>
                                setEditingInfo((prev) => ({ ...prev, conversation_summary: e.target.value }))
                              }
                            />
                            <Form.Control
                              as="textarea"
                              rows={3}
                              value={editingInfo.notes}
                              onChange={(e) => setEditingInfo((prev) => ({ ...prev, notes: e.target.value }))}
                            />
                            <div className="d-flex gap-2 mt-1">
                              <Button
                                size="sm"
                                onClick={() => void handleSaveProspectInfo(p.id)}
                                disabled={!canEdit || actionLoadingKey === `prospect-info-${p.id}`}
                              >
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline-secondary"
                                onClick={() => {
                                  setEditingInfoId(null);
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              </div>
            </Card.Body>
          </Card>
          )}
        </>
      )}
    </div>
  );
};

LinkedInHubPage.propTypes = {
  focus: PropTypes.oneOf(["all", "account", "dashboard", "searches_templates", "prospects", "inbox"]),
};

export default LinkedInHubPage;
