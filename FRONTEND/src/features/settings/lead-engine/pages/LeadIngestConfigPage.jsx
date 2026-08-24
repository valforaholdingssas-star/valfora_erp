import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";

import useLeadEngineConfig from "../hooks/useLeadEngineConfig.js";

const generateApiKey = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `lead_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `lead_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
};

const LeadIngestConfigPage = () => {
  const { leadConfig, loading, saveLeadConfig } = useLeadEngineConfig();
  const [form, setForm] = useState({});
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const apiBase = useMemo(() => {
    if (typeof window === "undefined") return "/api/v1/crm/leads/ingest/";
    return `${window.location.origin}/api/v1/crm/leads/ingest/`;
  }, []);

  useEffect(() => {
    if (leadConfig) setForm(leadConfig);
  }, [leadConfig]);

  if (loading || !leadConfig) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setStatus("");
    try {
      await saveLeadConfig(form);
      setStatus("Configuración de formularios web guardada.");
      setForm((prev) => ({ ...prev, public_ingest_api_key: "", clear_public_ingest_api_key: false }));
    } catch (err) {
      setError(err?.response?.data?.message || "No se pudo guardar la configuración.");
    }
  };

  const examplePayload = JSON.stringify(
    {
      email: "cliente@ejemplo.com",
      full_name: "María López",
      phone_number: "3001234567",
      message: "Quiero más información",
      company_name: "Acme SAS",
      source: "website",
    },
    null,
    2,
  );

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Lead Engine</div>
          <h1 className="h3 mb-1">Formularios web (API pública)</h1>
          <p className="text-muted mb-0">
            Conecta landing pages o formularios externos para crear contactos y deals automáticamente en el CRM.
          </p>
        </div>
      </div>

      {status ? <Alert variant="success" className="py-2">{status}</Alert> : null}
      {error ? <Alert variant="danger" className="py-2">{error}</Alert> : null}

      <div className="row g-4">
        <div className="col-lg-7">
          <section className="app-surface app-surface-padded">
            <div className="app-surface-header mb-3">
              <div>
                <div className="app-eyebrow">Activación</div>
                <h2 className="h6 mb-0">Endpoint de ingestión</h2>
              </div>
            </div>
            <Form onSubmit={onSubmit}>
              <Form.Check
                type="switch"
                label="Habilitar endpoint público de leads"
                checked={Boolean(form.public_ingest_enabled)}
                onChange={(e) => setForm((p) => ({ ...p, public_ingest_enabled: e.target.checked }))}
                className="mb-3"
              />
              <Form.Group className="mb-3">
                <Form.Label>API key</Form.Label>
                <div className="d-flex gap-2 flex-wrap">
                  <Form.Control
                    type="text"
                    autoComplete="new-password"
                    value={form.public_ingest_api_key || ""}
                    placeholder={form.has_public_ingest_api_key ? form.public_ingest_api_key_masked || "Configurada" : "Genera o pega una API key"}
                    onChange={(e) => setForm((p) => ({ ...p, public_ingest_api_key: e.target.value }))}
                  />
                  <Button
                    type="button"
                    variant="outline-secondary"
                    onClick={() => setForm((p) => ({ ...p, public_ingest_api_key: generateApiKey() }))}
                  >
                    Generar key
                  </Button>
                </div>
                <Form.Text className="text-muted">
                  Envía esta key en el header <code>X-Lead-Ingest-Key</code> o como <code>Authorization: Bearer …</code>.
                </Form.Text>
              </Form.Group>
              {form.has_public_ingest_api_key ? (
                <Form.Check
                  type="checkbox"
                  label="Limpiar API key guardada"
                  checked={Boolean(form.clear_public_ingest_api_key)}
                  onChange={(e) => setForm((p) => ({ ...p, clear_public_ingest_api_key: e.target.checked }))}
                  className="mb-3"
                />
              ) : null}
              <Button type="submit">Guardar</Button>
            </Form>
          </section>
        </div>

        <div className="col-lg-5">
          <section className="app-surface app-surface-padded mb-4">
            <div className="app-surface-header mb-3">
              <div>
                <div className="app-eyebrow">Integración</div>
                <h2 className="h6 mb-0">Cómo llamarlo</h2>
              </div>
            </div>
            <p className="small text-muted mb-2">URL del endpoint</p>
            <pre className="small bg-light border rounded p-2 mb-3 overflow-auto">{`POST ${apiBase}`}</pre>
            <p className="small text-muted mb-2">Headers</p>
            <pre className="small bg-light border rounded p-2 mb-3 overflow-auto">{`Content-Type: application/json
X-Lead-Ingest-Key: tu-api-key`}</pre>
            <p className="small text-muted mb-2">Body de ejemplo</p>
            <pre className="small bg-light border rounded p-2 mb-0 overflow-auto">{examplePayload}</pre>
          </section>

          <Alert variant={form.public_ingest_enabled ? "success" : "warning"} className="small mb-0">
            {form.public_ingest_enabled
              ? "El endpoint está habilitado. Los formularios externos ya pueden enviar leads."
              : "Activa el switch y guarda una API key para que el endpoint acepte solicitudes."}
          </Alert>
        </div>
      </div>
    </div>
  );
};

export default LeadIngestConfigPage;
