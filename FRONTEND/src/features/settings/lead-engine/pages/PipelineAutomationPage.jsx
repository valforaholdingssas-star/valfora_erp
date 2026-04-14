import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";

import PipelineAutomationPreview from "../components/PipelineAutomationPreview.jsx";
import useLeadEngineConfig from "../hooks/useLeadEngineConfig.js";

const PipelineAutomationPage = () => {
  const { pipelineConfig, loading, savePipelineConfig } = useLeadEngineConfig();
  const [form, setForm] = useState({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (pipelineConfig) setForm(pipelineConfig);
  }, [pipelineConfig]);

  if (loading || !pipelineConfig) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    await savePipelineConfig(form);
    setStatus("Automatización actualizada");
  };

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">Automatización del Pipeline</h1>
      {status && <Alert variant="success" className="py-2">{status}</Alert>}
      <Row className="g-3">
        <Col md={8}>
          <Card>
            <Card.Body>
              <Form onSubmit={onSubmit}>
                <Form.Check type="switch" label="Auto mover en primera respuesta" checked={Boolean(form.auto_move_on_first_response)} onChange={(e) => setForm((p) => ({ ...p, auto_move_on_first_response: e.target.checked }))} className="mb-2" />
                <Form.Check type="switch" label="Auto mover en reunión/llamada" checked={Boolean(form.auto_move_on_meeting)} onChange={(e) => setForm((p) => ({ ...p, auto_move_on_meeting: e.target.checked }))} className="mb-2" />
                <Form.Check type="switch" label="Auto mover en propuesta" checked={Boolean(form.auto_move_on_proposal)} onChange={(e) => setForm((p) => ({ ...p, auto_move_on_proposal: e.target.checked }))} className="mb-2" />
                <Form.Check type="switch" label="Auto mover en contrato" checked={Boolean(form.auto_move_on_contract)} onChange={(e) => setForm((p) => ({ ...p, auto_move_on_contract: e.target.checked }))} className="mb-2" />
                <Form.Check type="switch" label="Auto mover en contrato activo" checked={Boolean(form.auto_move_on_contract_signed)} onChange={(e) => setForm((p) => ({ ...p, auto_move_on_contract_signed: e.target.checked }))} className="mb-3" />

                <Row className="g-2">
                  <Col md={6}>
                    <Form.Label>Días para marcar stale</Form.Label>
                    <Form.Control type="number" min={1} value={form.stale_deal_days || 14} onChange={(e) => setForm((p) => ({ ...p, stale_deal_days: Number(e.target.value || 14) }))} />
                  </Col>
                  <Col md={6}>
                    <Form.Label>Días para auto-cerrar perdido</Form.Label>
                    <Form.Control type="number" min={1} value={form.auto_close_lost_days || 45} onChange={(e) => setForm((p) => ({ ...p, auto_close_lost_days: Number(e.target.value || 45) }))} />
                  </Col>
                </Row>

                <Button type="submit" className="mt-3">Guardar</Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <PipelineAutomationPreview config={form} />
        </Col>
      </Row>
    </div>
  );
};

export default PipelineAutomationPage;
