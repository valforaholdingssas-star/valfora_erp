import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Form, Nav, Spinner, Tab, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import {
  createActivity,
  fetchActivities,
  fetchContact,
  fetchContactChatHistory,
  fetchContactTimeline,
  fetchDeals,
  fetchDocuments,
  uploadDocument,
} from "../../../api/crm.js";
import { fetchContracts, fetchInvoices } from "../../../api/finance.js";
import ContactDaysBadge from "../components/ContactDaysBadge.jsx";
import { formatDealValue } from "../utils/formatters.js";

const ContactDetailPage = () => {
  const { id } = useParams();
  const [contact, setContact] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [deals, setDeals] = useState({ results: [] });
  const [activities, setActivities] = useState({ results: [] });
  const [documents, setDocuments] = useState({ results: [] });
  const [chatHistory, setChatHistory] = useState({ results: [], count: 0 });
  const [contracts, setContracts] = useState({ results: [] });
  const [invoices, setInvoices] = useState({ results: [] });
  const [loading, setLoading] = useState(true);
  const [activityForm, setActivityForm] = useState({
    subject: "",
    activity_type: "note",
    description: "",
  });

  const reload = useCallback(async () => {
    const [c, tl, dl, act, doc, ch, ctr, inv] = await Promise.all([
      fetchContact(id),
      fetchContactTimeline(id),
      fetchDeals({ contact: id, page_size: 100 }),
      fetchActivities({ contact: id, page_size: 100 }),
      fetchDocuments({ contact: id, page_size: 100 }),
      fetchContactChatHistory(id, { limit: 200 }),
      fetchContracts({ contact: id, page_size: 100 }),
      fetchInvoices({ contact: id, page_size: 100 }),
    ]);
    setContact(c);
    setTimeline(tl);
    setDeals(dl);
    setActivities(act);
    setDocuments(doc);
    setChatHistory(ch);
    setContracts(ctr || { results: [] });
    setInvoices(inv || { results: [] });
  }, [id]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reload]);

  const handleAddActivity = async (e) => {
    e.preventDefault();
    await createActivity({
      contact: id,
      subject: activityForm.subject,
      activity_type: activityForm.activity_type,
      description: activityForm.description,
      is_completed: false,
    });
    setActivityForm({ subject: "", activity_type: "note", description: "" });
    await reload();
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("contact", id);
    fd.append("name", file.name);
    fd.append("file", file);
    await uploadDocument(fd);
    e.target.value = "";
    await reload();
  };

  if (loading || !contact) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  const primaryDealId = deals.results?.[0]?.id || null;

  return (
    <div className="app-page">
      <div className="mb-2">
        <Link to="/crm/contacts">← Contactos</Link>
      </div>
      <div className="d-flex justify-content-between align-items-start mb-3 app-page-header">
        <div>
          <h1 className="h4 mb-1">
            {contact.first_name} {contact.last_name}
          </h1>
          <p className="text-muted mb-0">{contact.email}</p>
          <div className="d-flex align-items-center gap-2 mt-1">
            <Badge bg={contact.source === "whatsapp" ? "success" : "secondary"}>
              {contact.source || "other"}
            </Badge>
            <Badge bg="light" text="dark">{contact.lifecycle_stage}</Badge>
            <Badge bg="light" text="dark">{contact.intent_level}</Badge>
          </div>
          <ContactDaysBadge days={contact.days_since_last_contact} />
        </div>
        <div className="d-flex gap-2">
          <Button
            as={primaryDealId ? Link : "button"}
            to={primaryDealId ? `/chat/deal/${primaryDealId}` : undefined}
            variant="primary"
            size="sm"
            disabled={!primaryDealId}
          >
            Chat
          </Button>
          <Button as={Link} to={`/crm/contacts/${id}/edit`} variant="outline-primary" size="sm">
            Editar
          </Button>
        </div>
      </div>

      <Tab.Container defaultActiveKey="info">
        <Nav variant="tabs" className="mb-3">
          <Nav.Item>
            <Nav.Link eventKey="info">Información</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="activities">Actividades</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="deals">Deals</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="documents">Documentos</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="timeline">Historial CRM</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="chat">Chat</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="whatsapp">WhatsApp</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="finance">Finanzas</Nav.Link>
          </Nav.Item>
        </Nav>
        <Tab.Content>
          <Tab.Pane eventKey="info">
            <p>
              <strong>Etapa:</strong> {contact.lifecycle_stage}
            </p>
            <p>
              <strong>Intención:</strong> {contact.intent_level}
            </p>
            <p>
              <strong>Empresa:</strong> {contact.company_name || "—"}
            </p>
            <p className="mb-0">
              <strong>Notas:</strong> {contact.notes || "—"}
            </p>
          </Tab.Pane>
          <Tab.Pane eventKey="activities">
            <Form className="mb-3" onSubmit={handleAddActivity}>
              <Form.Group className="mb-2">
                <Form.Control
                  placeholder="Asunto"
                  value={activityForm.subject}
                  onChange={(e) => setActivityForm((p) => ({ ...p, subject: e.target.value }))}
                  required
                />
              </Form.Group>
              <Form.Select
                className="mb-2"
                value={activityForm.activity_type}
                onChange={(e) => setActivityForm((p) => ({ ...p, activity_type: e.target.value }))}
              >
                <option value="call">Llamada</option>
                <option value="email">Email</option>
                <option value="meeting">Reunión</option>
                <option value="note">Nota</option>
                <option value="task">Tarea</option>
                <option value="whatsapp">WhatsApp</option>
              </Form.Select>
              <Form.Control
                as="textarea"
                placeholder="Descripción"
                value={activityForm.description}
                onChange={(e) => setActivityForm((p) => ({ ...p, description: e.target.value }))}
              />
              <Button type="submit" size="sm" className="mt-2">
                Añadir
              </Button>
            </Form>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Asunto</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {activities.results?.map((a) => (
                  <tr key={a.id}>
                    <td>{a.subject}</td>
                    <td>{a.activity_type}</td>
                    <td>{a.is_completed ? "Hecha" : "Pendiente"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
          <Tab.Pane eventKey="deals">
            <Table size="sm">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Etapa</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {deals.results?.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/crm/deals/${d.id}`}>{d.title}</Link>
                    </td>
                    <td>{d.stage}</td>
                    <td>
                      {formatDealValue(d.value)} {d.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
          <Tab.Pane eventKey="documents">
            <Form.Group className="mb-3">
              <Form.Label>Subir archivo</Form.Label>
              <Form.Control type="file" onChange={handleUpload} />
            </Form.Group>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {documents.results?.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.file_size} bytes</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Tab.Pane>
          <Tab.Pane eventKey="timeline">
            <ul className="list-unstyled">
              {timeline.map((t) => (
                <li key={t.id} className="mb-2 border-bottom pb-2">
                  <strong>{t.subject}</strong> ({t.activity_type}) —{" "}
                  {new Date(t.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </Tab.Pane>
          <Tab.Pane eventKey="chat">
            <p className="text-muted small">
              Mensajes recientes de todas las conversaciones de este contacto (orden cronológico).
            </p>
            <Table size="sm" responsive>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Texto</th>
                </tr>
              </thead>
              <tbody>
                {chatHistory.results?.map((m) => (
                  <tr key={m.id}>
                    <td className="text-nowrap small">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="small">
                      {m.sender_type === "user" && "Agente"}
                      {m.sender_type === "contact" && "Contacto"}
                      {m.sender_type === "ai_bot" && "IA"}
                      {m.is_ai_generated && " · IA"}
                    </td>
                    <td className="small" style={{ maxWidth: "420px" }}>
                      {(m.content || "").slice(0, 500)}
                      {(m.content || "").length > 500 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {(!chatHistory.results || chatHistory.results.length === 0) && (
              <p className="text-muted mb-0">No hay mensajes de chat aún.</p>
            )}
          </Tab.Pane>
          <Tab.Pane eventKey="whatsapp">
            <p className="mb-2"><strong>Número WhatsApp:</strong> {contact.whatsapp_number || "—"}</p>
            <p className="mb-2">
              <strong>Ventana de servicio:</strong>{" "}
              {contact.customer_service_window_expires
                ? new Date(contact.customer_service_window_expires).toLocaleString()
                : "Sin ventana activa"}
            </p>
            <div className="d-flex gap-2">
              <Button
                as={primaryDealId ? Link : "button"}
                to={primaryDealId ? `/chat/deal/${primaryDealId}` : undefined}
                variant="primary"
                size="sm"
                disabled={!primaryDealId}
              >
                Abrir conversación
              </Button>
              <Button as={Link} to="/settings/whatsapp/templates" variant="outline-primary" size="sm">
                Enviar plantilla
              </Button>
            </div>
          </Tab.Pane>
          <Tab.Pane eventKey="finance">
            <div className="mb-3">
              <h6 className="mb-2">Contratos</h6>
              <Table size="sm">
                <thead>
                  <tr><th>Número</th><th>Estado</th><th>Valor</th></tr>
                </thead>
                <tbody>
                  {(contracts.results || []).map((c) => (
                    <tr key={c.id}>
                      <td>{c.contract_number}</td>
                      <td>{c.status}</td>
                      <td>{c.total_value} {c.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div>
              <h6 className="mb-2">Facturas</h6>
              <Table size="sm">
                <thead>
                  <tr><th>Número</th><th>Estado</th><th>Total</th><th>Pagado</th></tr>
                </thead>
                <tbody>
                  {(invoices.results || []).map((i) => (
                    <tr key={i.id}>
                      <td>{i.invoice_number}</td>
                      <td>{i.status}</td>
                      <td>{i.total_amount}</td>
                      <td>{i.amount_paid}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Tab.Pane>
        </Tab.Content>
      </Tab.Container>
    </div>
  );
};

export default ContactDetailPage;
