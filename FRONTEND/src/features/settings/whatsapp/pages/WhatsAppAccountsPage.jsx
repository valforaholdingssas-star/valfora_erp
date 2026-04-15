import { useEffect, useState } from "react";
import { Alert, Button, Card, Form, Table } from "react-bootstrap";

import {
  createWhatsAppAccount,
  fetchWhatsAppAccounts,
  updateWhatsAppAccount,
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
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [verifyMap, setVerifyMap] = useState({});

  const load = async () => {
    try {
      const data = await fetchWhatsAppAccounts({ page_size: 100 });
      const rows = data.results || [];
      setAccounts(rows);
      setVerifyMap((prev) => {
        const next = { ...prev };
        rows.forEach((a) => {
          if (next[a.id] === undefined) next[a.id] = { ok: null };
        });
        return next;
      });

      await Promise.all(
        rows.map(async (a) => {
          try {
            const result = await verifyWhatsAppAccount(a.id);
            setVerifyMap((prev) => ({ ...prev, [a.id]: result }));
          } catch {
            setVerifyMap((prev) => ({ ...prev, [a.id]: { ok: false } }));
          }
        }),
      );
    } catch {
      setError("No se pudieron cargar las cuentas de WhatsApp.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      if (editingId) {
        const payload = {
          name: form.name,
          waba_id: form.waba_id,
          api_version: form.api_version,
          webhook_verify_token: form.webhook_verify_token,
        };
        if (form.access_token.trim()) payload.access_token = form.access_token.trim();
        if (form.webhook_secret.trim()) payload.webhook_secret = form.webhook_secret.trim();
        await updateWhatsAppAccount(editingId, payload);
        setSuccess("Cuenta actualizada correctamente.");
      } else {
        await createWhatsAppAccount(form);
        setSuccess("Cuenta creada correctamente.");
      }
      setForm(emptyForm);
      setEditingId("");
      await load();
    } catch {
      setError("No se pudo guardar la cuenta.");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (account) => {
    setError("");
    setSuccess("");
    setEditingId(account.id);
    setForm({
      name: account.name || "",
      waba_id: account.waba_id || "",
      access_token: "",
      api_version: account.api_version || "v21.0",
      webhook_verify_token: account.webhook_verify_token || "",
      webhook_secret: "",
    });
  };

  const cancelEdit = () => {
    setEditingId("");
    setForm(emptyForm);
    setError("");
    setSuccess("");
  };

  const verifyAccount = async (id) => {
    try {
      const result = await verifyWhatsAppAccount(id);
      setVerifyMap((p) => ({ ...p, [id]: result }));
      setSuccess("Verificación ejecutada.");
    } catch {
      setVerifyMap((p) => ({ ...p, [id]: { ok: false } }));
      setError("La verificación falló. Revisa token/permisos en Meta.");
    }
  };

  const webhookUrl = `${window.location.origin.replace(':3000', ':8000')}/api/v1/whatsapp/webhook/`;

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">WhatsApp · Cuentas WABA</h1>
      {error && <Alert variant="danger" className="py-2">{error}</Alert>}
      {success && <Alert variant="success" className="py-2">{success}</Alert>}
      <Card className="mb-3">
        <Card.Body>
          <h2 className="h6">Webhook público</h2>
          <WebhookUrlDisplay url={webhookUrl} />
        </Card.Body>
      </Card>
      <Card className="mb-3">
        <Card.Body>
          <h2 className="h6">{editingId ? "Editar cuenta" : "Nueva cuenta"}</h2>
          <Form onSubmit={onSubmit} className="row g-2">
            <div className="col-md-4"><Form.Control placeholder="Nombre" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></div>
            <div className="col-md-4"><Form.Control placeholder="WABA ID" value={form.waba_id} onChange={(e) => setForm((p) => ({ ...p, waba_id: e.target.value }))} required /></div>
            <div className="col-md-4"><Form.Control placeholder="API version" value={form.api_version} onChange={(e) => setForm((p) => ({ ...p, api_version: e.target.value }))} required /></div>
            <div className="col-md-6"><Form.Control type="password" placeholder={editingId ? "Access token (dejar vacío para no cambiar)" : "Access token"} value={form.access_token} onChange={(e) => setForm((p) => ({ ...p, access_token: e.target.value }))} required={!editingId} /></div>
            <div className="col-md-3"><Form.Control placeholder="Verify token" value={form.webhook_verify_token} onChange={(e) => setForm((p) => ({ ...p, webhook_verify_token: e.target.value }))} required /></div>
            <div className="col-md-3"><Form.Control type="password" placeholder={editingId ? "Webhook secret (dejar vacío para no cambiar)" : "Webhook secret"} value={form.webhook_secret} onChange={(e) => setForm((p) => ({ ...p, webhook_secret: e.target.value }))} required={!editingId} /></div>
            <div className="col-12 d-flex gap-2">
              <Button type="submit" disabled={saving}>
                {editingId ? "Guardar cambios" : "Guardar cuenta"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline-secondary" onClick={cancelEdit} disabled={saving}>
                  Cancelar edición
                </Button>
              )}
            </div>
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
                  <td className="d-flex gap-2">
                    <Button size="sm" variant="outline-secondary" onClick={() => startEdit(a)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="outline-primary" onClick={() => verifyAccount(a.id)}>
                      Verificar
                    </Button>
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
