import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Spinner, Table } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createActivity,
  deleteDeal,
  deleteDocument,
  fetchActivities,
  fetchCompanies,
  fetchDeal,
  fetchDealStageHistory,
  fetchDocuments,
  moveDealStage,
  uploadDocument,
  updateDeal,
} from "../../../api/crm.js";
import { createOrOpenConversation } from "../../../api/chat.js";
import { fetchUsers } from "../../../api/users.js";
import { formatDealDisplayNumber, formatDealValue } from "../utils/formatters.js";

const DealDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [history, setHistory] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [deletingDeal, setDeletingDeal] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealError, setDealError] = useState("");
  const [dealSuccess, setDealSuccess] = useState("");
  const [companies, setCompanies] = useState({ results: [] });
  const [users, setUsers] = useState({ results: [] });
  const [documents, setDocuments] = useState({ results: [] });
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentForm, setDocumentForm] = useState({
    name: "",
    description: "",
    file: null,
  });
  const [dealForm, setDealForm] = useState({
    title: "",
    value: "",
    currency: "USD",
    stage: "new_lead",
    probability: 0,
    expected_close_date: "",
    description: "",
    lost_reason: "",
    company: "",
    assigned_to: "",
  });
  const [activityForm, setActivityForm] = useState({
    subject: "",
    activity_type: "call",
    due_date: "",
    description: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [dealRes, historyRes, activitiesRes] = await Promise.all([
        fetchDeal(id),
        fetchDealStageHistory(id),
        fetchActivities({ deal: id, page_size: 100 }),
      ]);
      setDeal(dealRes);
      setHistory(historyRes || []);
      setActivities(activitiesRes.results || []);
      setDealForm({
        title: dealRes.title || "",
        value: dealRes.value ?? "",
        currency: dealRes.currency || "USD",
        stage: dealRes.stage || "new_lead",
        probability: dealRes.probability ?? 0,
        expected_close_date: dealRes.expected_close_date || "",
        description: dealRes.description || "",
        lost_reason: dealRes.lost_reason || "",
        company: dealRes.company || "",
        assigned_to: dealRes.assigned_to || "",
      });
      const docs = await fetchDocuments({ deal: id, page_size: 100 });
      setDocuments(docs || { results: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    fetchCompanies({ page_size: 200 }).then(setCompanies).catch(() => {});
    fetchUsers({ page_size: 200, is_active: true }).then(setUsers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading || !deal) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  const advance = async () => {
    const nextMap = {
      new_lead: "contacted",
      contacted: "qualified",
      qualified: "proposal",
      qualification: "proposal",
      proposal: "negotiation",
      negotiation: "closed_won",
    };
    const next = nextMap[deal.stage];
    if (!next) return;
    await moveDealStage(deal.id, { to_stage: next, notes: "Avance manual desde detalle" });
    await load();
  };

  const createDealActivity = async (e) => {
    e.preventDefault();
    if (!deal?.contact) {
      setActivityError("El deal no tiene contacto asociado.");
      return;
    }
    if (!activityForm.due_date) {
      setActivityError("La fecha y hora son obligatorias para que se refleje en el calendario.");
      return;
    }
    setCreatingActivity(true);
    setActivityError("");
    try {
      await createActivity({
        contact: deal.contact,
        deal: deal.id,
        subject: activityForm.subject.trim(),
        activity_type: activityForm.activity_type,
        description: activityForm.description.trim(),
        due_date: activityForm.due_date ? new Date(activityForm.due_date).toISOString() : null,
        is_completed: false,
      });
      setActivityForm({
        subject: "",
        activity_type: "call",
        due_date: "",
        description: "",
      });
      await load();
    } catch {
      setActivityError("No se pudo crear la actividad.");
    } finally {
      setCreatingActivity(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (!window.confirm("¿Seguro que quieres eliminar este deal?")) return;
    setDeletingDeal(true);
    try {
      await deleteDeal(deal.id);
      navigate("/crm/pipeline");
    } finally {
      setDeletingDeal(false);
    }
  };

  const handleOpenWhatsappConversation = async () => {
    try {
      await createOrOpenConversation({ deal: deal.id, channel: "whatsapp" });
      navigate(`/chat/deal/${deal.id}`);
    } catch {
      // noop
    }
  };

  const saveDeal = async (e) => {
    e.preventDefault();
    setSavingDeal(true);
    setDealError("");
    setDealSuccess("");
    try {
      const payload = {
        title: dealForm.title.trim(),
        value: dealForm.value === "" ? 0 : Number(dealForm.value),
        currency: dealForm.currency.trim().toUpperCase() || "USD",
        stage: dealForm.stage,
        probability: Number(dealForm.probability || 0),
        expected_close_date: dealForm.expected_close_date || null,
        description: dealForm.description.trim(),
        lost_reason: dealForm.lost_reason.trim(),
        company: dealForm.company || null,
        assigned_to: dealForm.assigned_to || null,
      };
      await updateDeal(deal.id, payload);
      setDealSuccess("Deal actualizado.");
      await load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setDealError(typeof detail === "string" ? detail : "No se pudo guardar el deal.");
    } finally {
      setSavingDeal(false);
    }
  };

  const submitDocument = async (e) => {
    e.preventDefault();
    if (!documentForm.file) {
      setDocumentError("Selecciona un archivo.");
      return;
    }
    setUploadingDocument(true);
    setDocumentError("");
    try {
      const formData = new FormData();
      formData.append("deal", deal.id);
      formData.append("name", documentForm.name.trim() || documentForm.file.name);
      formData.append("description", documentForm.description.trim());
      formData.append("file", documentForm.file);
      await uploadDocument(formData);
      setDocumentForm({ name: "", description: "", file: null });
      await load();
    } catch {
      setDocumentError("No se pudo adjuntar el archivo al deal.");
    } finally {
      setUploadingDocument(false);
    }
  };

  const removeDocument = async (documentId) => {
    if (!window.confirm("¿Eliminar este archivo del deal?")) return;
    await deleteDocument(documentId);
    await load();
  };

  return (
    <div className="app-page">
      <div className="mb-2"><Link to="/crm/pipeline">← Pipeline</Link></div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h1 className="h4 mb-0">{deal.title}</h1>
        <Badge bg="light" text="dark" className="border">{formatDealDisplayNumber(deal.id)}</Badge>
      </div>
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Badge bg="primary">{deal.stage}</Badge>
            {deal.is_stale && <Badge bg="secondary">stale</Badge>}
          </div>
          <div className="small text-muted mb-2">Contacto: {deal.contact_name}</div>
          <div className="small text-muted mb-2">Empresa: {deal.company_name || "Sin empresa"}</div>
          <div className="small text-muted mb-2">Asignado: {deal.assigned_to_name || "Sin asignar"}</div>
          <div className="small text-muted mb-3">Valor: {formatDealValue(deal.value)} {deal.currency}</div>
          <div className="d-flex gap-2">
            <Button size="sm" onClick={advance}>Avanzar etapa</Button>
            <Button size="sm" variant="outline-primary" onClick={handleOpenWhatsappConversation}>
              Abrir WhatsApp
            </Button>
            <Button size="sm" variant="outline-danger" onClick={handleDeleteDeal} disabled={deletingDeal}>
              {deletingDeal ? "Eliminando..." : "Eliminar deal"}
            </Button>
          </div>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header className="py-2">Editar deal</Card.Header>
        <Card.Body>
          {dealError ? <Alert variant="danger" className="py-2">{dealError}</Alert> : null}
          {dealSuccess ? <Alert variant="success" className="py-2">{dealSuccess}</Alert> : null}
          <Form onSubmit={saveDeal}>
            <div className="row g-2">
              <div className="col-md-6">
                <Form.Label>Título</Form.Label>
                <Form.Control
                  required
                  value={dealForm.title}
                  onChange={(e) => setDealForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
              <div className="col-md-2">
                <Form.Label>Valor</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  value={dealForm.value}
                  onChange={(e) => setDealForm((p) => ({ ...p, value: e.target.value }))}
                />
              </div>
              <div className="col-md-2">
                <Form.Label>Moneda</Form.Label>
                <Form.Control
                  value={dealForm.currency}
                  onChange={(e) => setDealForm((p) => ({ ...p, currency: e.target.value }))}
                />
              </div>
              <div className="col-md-2">
                <Form.Label>Probabilidad %</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  max="100"
                  value={dealForm.probability}
                  onChange={(e) => setDealForm((p) => ({ ...p, probability: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
                <Form.Label>Etapa</Form.Label>
                <Form.Select
                  value={dealForm.stage}
                  onChange={(e) => setDealForm((p) => ({ ...p, stage: e.target.value }))}
                >
                  <option value="new_lead">Nuevo lead</option>
                  <option value="contacted">Contactado</option>
                  <option value="qualified">Calificado</option>
                  <option value="proposal">Propuesta</option>
                  <option value="negotiation">Negociación</option>
                  <option value="closed_won">Ganado</option>
                  <option value="closed_lost">Perdido</option>
                </Form.Select>
              </div>
              <div className="col-md-3">
                <Form.Label>Cierre esperado</Form.Label>
                <Form.Control
                  type="date"
                  value={dealForm.expected_close_date || ""}
                  onChange={(e) => setDealForm((p) => ({ ...p, expected_close_date: e.target.value }))}
                />
              </div>
              <div className="col-md-6">
                <Form.Label>Empresa</Form.Label>
                <Form.Select
                  value={dealForm.company}
                  onChange={(e) => setDealForm((p) => ({ ...p, company: e.target.value }))}
                >
                  <option value="">Sin empresa</option>
                  {(companies.results || []).map((co) => (
                    <option key={co.id} value={co.id}>{co.name}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-6">
                <Form.Label>Asignado a</Form.Label>
                <Form.Select
                  value={dealForm.assigned_to}
                  onChange={(e) => setDealForm((p) => ({ ...p, assigned_to: e.target.value }))}
                >
                  <option value="">Sin asignar</option>
                  {(users.results || []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {[user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email}
                    </option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-6">
                <Form.Label>Motivo de pérdida</Form.Label>
                <Form.Control
                  value={dealForm.lost_reason}
                  onChange={(e) => setDealForm((p) => ({ ...p, lost_reason: e.target.value }))}
                />
              </div>
              <div className="col-12">
                <Form.Label>Descripción</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={dealForm.description}
                  onChange={(e) => setDealForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3 d-flex justify-content-end">
              <Button type="submit" disabled={savingDeal}>
                {savingDeal ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <Card className="mb-3">
        <Card.Header className="py-2">Historial de etapas</Card.Header>
        <Card.Body className="p-0">
          <Table size="sm" className="mb-0">
            <thead>
              <tr><th>Fecha</th><th>De</th><th>A</th><th>Trigger</th></tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{new Date(h.created_at).toLocaleString()}</td>
                  <td>{h.from_stage || "-"}</td>
                  <td>{h.to_stage}</td>
                  <td>{h.trigger}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header className="py-2">Archivos del deal</Card.Header>
        <Card.Body>
          {documentError ? <Alert variant="danger" className="py-2">{documentError}</Alert> : null}
          <Form onSubmit={submitDocument} className="mb-3">
            <div className="row g-2">
              <div className="col-md-4">
                <Form.Control
                  value={documentForm.name}
                  onChange={(e) => setDocumentForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre visible"
                />
              </div>
              <div className="col-md-4">
                <Form.Control
                  value={documentForm.description}
                  onChange={(e) => setDocumentForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Descripción"
                />
              </div>
              <div className="col-md-4">
                <Form.Control
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.png,.jpg,.jpeg"
                  onChange={(e) => setDocumentForm((p) => ({ ...p, file: e.target.files?.[0] || null }))}
                />
              </div>
            </div>
            <div className="mt-2 d-flex justify-content-end">
              <Button type="submit" size="sm" disabled={uploadingDocument}>
                {uploadingDocument ? "Adjuntando..." : "Adjuntar archivo"}
              </Button>
            </div>
          </Form>
          <Table size="sm" className="mb-0">
            <thead>
              <tr><th>Archivo</th><th>Descripción</th><th>Tamaño</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {(documents.results || []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">No hay archivos adjuntos en este deal.</td>
                </tr>
              ) : null}
              {(documents.results || []).map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.name}</td>
                  <td>{doc.description || "—"}</td>
                  <td>{doc.file_size ? `${Math.round(doc.file_size / 1024)} KB` : "—"}</td>
                  <td>
                    <Button size="sm" variant="outline-danger" onClick={() => removeDocument(doc.id)}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Card className="mt-3">
        <Card.Header className="py-2">Actividades vinculadas</Card.Header>
        <Card.Body>
          <Form onSubmit={createDealActivity} className="mb-3">
            <div className="row g-2">
              <div className="col-md-5">
                <Form.Control
                  required
                  placeholder="Asunto"
                  value={activityForm.subject}
                  onChange={(e) => setActivityForm((p) => ({ ...p, subject: e.target.value }))}
                />
              </div>
              <div className="col-md-3">
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
              </div>
              <div className="col-md-3">
                <Form.Control
                  type="datetime-local"
                  required
                  value={activityForm.due_date}
                  onChange={(e) => setActivityForm((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
              <div className="col-md-1 d-grid">
                <Button type="submit" disabled={creatingActivity} size="sm">
                  +
                </Button>
              </div>
            </div>
            <Form.Control
              as="textarea"
              rows={2}
              className="mt-2"
              placeholder="Descripción (opcional)"
              value={activityForm.description}
              onChange={(e) => setActivityForm((p) => ({ ...p, description: e.target.value }))}
            />
          </Form>
          {activityError ? <Alert variant="danger" className="py-2">{activityError}</Alert> : null}
          <Table size="sm" className="mb-0">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Asunto</th></tr>
            </thead>
            <tbody>
              {activities.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No hay actividades asociadas a este deal.
                  </td>
                </tr>
              ) : null}
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td>{a.activity_type}</td>
                  <td>{a.subject}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default DealDetailPage;
