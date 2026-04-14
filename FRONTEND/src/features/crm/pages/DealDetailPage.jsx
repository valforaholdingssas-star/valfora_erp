import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Spinner, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import {
  createActivity,
  fetchActivities,
  fetchDeal,
  fetchDealStageHistory,
  moveDealStage,
} from "../../../api/crm.js";
import { formatDealValue } from "../utils/formatters.js";

const DealDetailPage = () => {
  const { id } = useParams();
  const [deal, setDeal] = useState(null);
  const [history, setHistory] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [activityError, setActivityError] = useState("");
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
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

  return (
    <div className="app-page">
      <div className="mb-2"><Link to="/crm/pipeline">← Pipeline</Link></div>
      <h1 className="h4 mb-3">{deal.title}</h1>
      <Card className="mb-3">
        <Card.Body>
          <div className="d-flex align-items-center gap-2 mb-2">
            <Badge bg="primary">{deal.stage}</Badge>
            {deal.is_stale && <Badge bg="secondary">stale</Badge>}
          </div>
          <div className="small text-muted mb-2">Contacto: {deal.contact_name}</div>
          <div className="small text-muted mb-3">Valor: {formatDealValue(deal.value)} {deal.currency}</div>
          <Button size="sm" onClick={advance}>Avanzar etapa</Button>
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
