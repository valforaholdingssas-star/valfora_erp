import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";

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
      <h1 className="h4 mb-3">Automatización de Leads</h1>
      {status && <Alert variant="success" className="py-2">{status}</Alert>}
      <Row className="g-3">
        <Col md={8}>
          <Card>
            <Card.Body>
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

                <Button type="submit" className="mt-3">Guardar</Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <LeadFlowPreview config={form} />
        </Col>
      </Row>
    </div>
  );
};

export default LeadEngineConfigPage;
