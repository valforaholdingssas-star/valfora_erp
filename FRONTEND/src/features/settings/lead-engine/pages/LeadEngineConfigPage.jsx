import { useEffect, useState } from "react";
import { Alert, Button, Col, Form, Row, Spinner } from "react-bootstrap";

import { fetchUsers } from "../../../../api/users.js";
import AssignmentStrategyForm from "../components/AssignmentStrategyForm.jsx";
import LeadFlowPreview from "../components/LeadFlowPreview.jsx";
import useLeadEngineConfig from "../hooks/useLeadEngineConfig.js";

const LeadEngineConfigPage = () => {
  const { leadConfig, loading, saveLeadConfig } = useLeadEngineConfig();
  const [form, setForm] = useState({});
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchUsers({ page_size: 200 }).then((d) => setUsers(d.results || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (leadConfig) setForm(leadConfig);
  }, [leadConfig]);

  if (loading || !leadConfig) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    await saveLeadConfig(form);
    setStatus("Configuración guardada");
  };

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Lead Engine</div>
          <h1 className="h3 mb-1">Automatización de leads</h1>
          <p className="text-muted mb-0">Define creación automática, asignación y tiempos de respuesta del embudo.</p>
        </div>
      </div>
      {status && <Alert variant="success" className="py-2">{status}</Alert>}
      <Row className="g-4">
        <Col md={8}>
          <section className="app-surface app-surface-padded">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Parámetros</div>
                <h2 className="h6 mb-0">Configuración principal</h2>
              </div>
            </div>
            <Form onSubmit={onSubmit}>
                <Form.Check
                  type="switch"
                  label="Crear contacto automáticamente"
                  checked={Boolean(form.auto_create_contact)}
                  onChange={(e) => setForm((p) => ({ ...p, auto_create_contact: e.target.checked }))}
                  className="mb-2"
                />
                <Form.Check
                  type="switch"
                  label="Crear deal automáticamente"
                  checked={Boolean(form.auto_create_deal)}
                  onChange={(e) => setForm((p) => ({ ...p, auto_create_deal: e.target.checked }))}
                  className="mb-2"
                />
                <Form.Check
                  type="switch"
                  label="Crear actividad de follow-up"
                  checked={Boolean(form.auto_create_follow_up)}
                  onChange={(e) => setForm((p) => ({ ...p, auto_create_follow_up: e.target.checked }))}
                  className="mb-3"
                />

                <Row className="g-2">
                  <Col md={6}>
                    <Form.Label>Estrategia de asignación</Form.Label>
                    <AssignmentStrategyForm
                      value={form.assignment_strategy}
                      onChange={(value) => setForm((p) => ({ ...p, assignment_strategy: value }))}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Label>Usuario fijo (si aplica)</Form.Label>
                    <Form.Select
                      value={form.assignment_specific_user || ""}
                      onChange={(e) => setForm((p) => ({ ...p, assignment_specific_user: e.target.value || null }))}
                    >
                      <option value="">Sin usuario fijo</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.first_name || u.email}</option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>

                <Row className="g-2 mt-1">
                  <Col md={6}>
                    <Form.Label>Etapa inicial del deal</Form.Label>
                    <Form.Control
                      value={form.default_deal_pipeline_stage || "new_lead"}
                      onChange={(e) => setForm((p) => ({ ...p, default_deal_pipeline_stage: e.target.value }))}
                    />
                  </Col>
                  <Col md={6}>
                    <Form.Label>Tiempo máximo de respuesta (min)</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      value={form.max_response_time_minutes || 60}
                      onChange={(e) => setForm((p) => ({ ...p, max_response_time_minutes: Number(e.target.value || 60) }))}
                    />
                  </Col>
                </Row>

                <hr className="my-4" />
                <div className="app-eyebrow mb-2">Formularios externos</div>
                <Form.Check
                  type="switch"
                  label="Habilitar endpoint público de leads"
                  checked={Boolean(form.public_ingest_enabled)}
                  onChange={(e) => setForm((p) => ({ ...p, public_ingest_enabled: e.target.checked }))}
                  className="mb-2"
                />
                <Form.Group className="mb-2">
                  <Form.Label>API key de ingestión</Form.Label>
                  <Form.Control
                    type="password"
                    autoComplete="new-password"
                    placeholder={form.has_public_ingest_api_key ? form.public_ingest_api_key_masked || "Configurada" : "Pegar nueva API key"}
                    onChange={(e) => setForm((p) => ({ ...p, public_ingest_api_key: e.target.value }))}
                  />
                  <Form.Text className="text-muted">
                    Endpoint: <code>POST /api/v1/crm/leads/ingest/</code> con header <code>X-Lead-Ingest-Key</code>.
                  </Form.Text>
                </Form.Group>
                <Form.Check
                  type="checkbox"
                  label="Limpiar API key guardada"
                  checked={Boolean(form.clear_public_ingest_api_key)}
                  onChange={(e) => setForm((p) => ({ ...p, clear_public_ingest_api_key: e.target.checked }))}
                  className="mb-3"
                />

                <Button type="submit" className="mt-3">Guardar</Button>
            </Form>
          </section>
        </Col>
        <Col md={4}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Vista previa</div>
                <h2 className="h6 mb-0">Flujo resultante</h2>
              </div>
            </div>
            <LeadFlowPreview config={form} />
          </section>
        </Col>
      </Row>
    </div>
  );
};

export default LeadEngineConfigPage;
