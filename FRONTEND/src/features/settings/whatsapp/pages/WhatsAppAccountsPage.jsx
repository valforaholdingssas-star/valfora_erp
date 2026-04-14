import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Table } from "react-bootstrap";

import {
  createWhatsAppAccount,
  fetchWhatsAppAccounts,
  verifyWhatsAppAccount,
} from "../../../../api/whatsapp.js";
import ConnectionStatusIndicator from "../components/ConnectionStatusIndicator.jsx";
import WebhookUrlDisplay from "../components/WebhookUrlDisplay.jsx";

const emptyForm = {
  name: "",
  waba_id: "",
  access_token: "",
  api_version: "v21.0",
  webhook_verify_token: "",
  webhook_secret: "",
};

const WhatsAppAccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [verifyMap, setVerifyMap] = useState({});

  const load = () => {
    fetchWhatsAppAccounts({ page_size: 100 })
      .then((data) => setAccounts(data.results || []))
      .catch(() => setError("No se pudieron cargar las cuentas de WhatsApp."));
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createWhatsAppAccount(form);
      setForm(emptyForm);
      load();
    } catch {
      setError("No se pudo guardar la cuenta.");
    }
  };

  const webhookUrl = `${window.location.origin.replace(':3000', ':8000')}/api/v1/whatsapp/webhook/`;

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">WhatsApp · Cuentas WABA</h1>
      {error && <Alert variant="danger" className="py-2">{error}</Alert>}
      <Card className="mb-3">
        <Card.Body>
          <h2 className="h6">Webhook público</h2>
          <WebhookUrlDisplay url={webhookUrl} />
        </Card.Body>
      </Card>
      <Card className="mb-3">
        <Card.Body>
          <h2 className="h6">Nueva cuenta</h2>
          <Form onSubmit={onSubmit} className="row g-2">
            <div className="col-md-4"><Form.Control placeholder="Nombre" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
            <div className="col-md-4"><Form.Control placeholder="WABA ID" value={form.waba_id} onChange={(e) => setForm((p) => ({ ...p, waba_id: e.target.value }))} required /></div>
            <div className="col-md-4"><Form.Control placeholder="API version" value={form.api_version} onChange={(e) => setForm((p) => ({ ...p, api_version: e.target.value }))} required /></div>
            <div className="col-md-6"><Form.Control type="password" placeholder="Access token" value={form.access_token} onChange={(e) => setForm((p) => ({ ...p, access_token: e.target.value }))} required /></div>
            <div className="col-md-3"><Form.Control placeholder="Verify token" value={form.webhook_verify_token} onChange={(e) => setForm((p) => ({ ...p, webhook_verify_token: e.target.value }))} required /></div>
            <div className="col-md-3"><Form.Control type="password" placeholder="Webhook secret" value={form.webhook_secret} onChange={(e) => setForm((p) => ({ ...p, webhook_secret: e.target.value }))} required /></div>
            <div className="col-12"><Button type="submit">Guardar cuenta</Button></div>
          </Form>
        </Card.Body>
      </Card>
      <Card>
        <Card.Body>
          <h2 className="h6">Cuentas registradas</h2>
          <Table size="sm" responsive>
            <thead><tr><th>Nombre</th><th>WABA</th><th>Versión</th><th>Conexión</th><th>Acciones</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.waba_id}</td>
                  <td>{a.api_version}</td>
                  <td><ConnectionStatusIndicator ok={Boolean(verifyMap[a.id]?.ok)} /></td>
                  <td>
                    <Button size="sm" variant="outline-primary" onClick={async () => {
                      const result = await verifyWhatsAppAccount(a.id).catch(() => ({ ok: false }));
                      setVerifyMap((p) => ({ ...p, [a.id]: result }));
                    }}>Verificar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppAccountsPage;
