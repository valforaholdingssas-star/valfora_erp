import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, Spinner, Table } from "react-bootstrap";
import { Link, Navigate } from "react-router-dom";

import {
  createAiConfiguration,
  deleteAiConfiguration,
  fetchAiConfigurations,
  fetchAiRuntimeSettings,
  patchAiConfiguration,
  patchAiRuntimeSettings,
  testAiConfiguration,
} from "../../../api/aiConfig.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const emptyForm = () => ({
  name: "Nueva configuración",
  system_prompt: "",
  temperature: 0.7,
  max_tokens: 512,
  llm_model: "gpt-4o-mini",
  is_default: false,
  max_history_messages: 20,
  moderation_enabled: true,
  daily_token_budget_per_conversation: 100000,
  rag_enabled: true,
  rag_top_k: 5,
});

const AIConfigPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [testMessage, setTestMessage] = useState("Hola, ¿en qué puedes ayudarme?");
  const [testReply, setTestReply] = useState("");
  const [testMeta, setTestMeta] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testError, setTestError] = useState(null);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState(null);
  const [runtimeSuccess, setRuntimeSuccess] = useState(null);
  const [runtimeForm, setRuntimeForm] = useState({
    openai_api_key: "",
    clear_openai_api_key: false,
    openai_embedding_model: "text-embedding-3-small",
    openai_moderation_disabled: false,
    has_openai_api_key: false,
    openai_api_key_masked: "",
  });

  const canEdit = user && ["admin", "super_admin"].includes(user.role);

  const setFormFromRow = useCallback((row) => {
    setForm({
      name: row.name || "",
      system_prompt: row.system_prompt || "",
      temperature: row.temperature ?? 0.7,
      max_tokens: row.max_tokens ?? 512,
      llm_model: row.llm_model || "gpt-4o-mini",
      is_default: Boolean(row.is_default),
      max_history_messages: row.max_history_messages ?? 20,
      moderation_enabled: row.moderation_enabled !== false,
      daily_token_budget_per_conversation: row.daily_token_budget_per_conversation ?? 100000,
      rag_enabled: row.rag_enabled !== false,
      rag_top_k: row.rag_top_k ?? 5,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, runtime] = await Promise.all([
        fetchAiConfigurations({ page_size: 100 }),
        fetchAiRuntimeSettings(),
      ]);
      const rows = data.results || [];
      setItems(rows);
      setRuntimeForm((prev) => ({
        ...prev,
        openai_api_key: "",
        clear_openai_api_key: false,
        openai_embedding_model: runtime.openai_embedding_model || "text-embedding-3-small",
        openai_moderation_disabled: Boolean(runtime.openai_moderation_disabled),
        has_openai_api_key: Boolean(runtime.has_openai_api_key),
        openai_api_key_masked: runtime.openai_api_key_masked || "",
      }));
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    } catch {
      setError("No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canEdit) load();
  }, [canEdit, load]);

  useEffect(() => {
    if (!selectedId) return;
    const row = items.find((r) => r.id === selectedId);
    if (row) setFormFromRow(row);
  }, [selectedId, items, setFormFromRow]);

  const handleSelect = (row) => {
    setSelectedId(row.id);
    setFormFromRow(row);
    setTestReply("");
    setTestMeta(null);
    setTestError(null);
  };

  const handleNew = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createAiConfiguration(emptyForm());
      setSelectedId(created.id);
      setFormFromRow(created);
      await load();
    } catch {
      setError("No se pudo crear la configuración.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await patchAiConfiguration(selectedId, {
        name: form.name.trim() || "Sin nombre",
        system_prompt: form.system_prompt,
        temperature: Number(form.temperature),
        max_tokens: Number(form.max_tokens),
        llm_model: form.llm_model.trim(),
        is_default: Boolean(form.is_default),
        max_history_messages: Number(form.max_history_messages),
        moderation_enabled: Boolean(form.moderation_enabled),
        daily_token_budget_per_conversation: Number(form.daily_token_budget_per_conversation),
        rag_enabled: Boolean(form.rag_enabled),
        rag_top_k: Number(form.rag_top_k),
      });
      await load();
    } catch {
      setError("No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm("¿Desactivar esta configuración?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteAiConfiguration(selectedId);
      setSelectedId(null);
      setForm(emptyForm());
      await load();
    } catch {
      setError("No se pudo eliminar.");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (e) => {
    e.preventDefault();
    if (!selectedId || !testMessage.trim()) return;
    setTestLoading(true);
    setTestError(null);
    setTestReply("");
    setTestMeta(null);
    try {
      const res = await testAiConfiguration(selectedId, { message: testMessage.trim() });
      setTestReply(res.reply || "");
      setTestMeta({
        prompt_tokens: res.prompt_tokens,
        completion_tokens: res.completion_tokens,
        total_tokens: res.total_tokens,
      });
    } catch (err) {
      const d = err?.response?.data;
      const msg = d?.message || d?.detail || err?.message || "Error al probar.";
      setTestError(typeof msg === "string" ? msg : "Error al probar.");
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveRuntime = async (e) => {
    e.preventDefault();
    setRuntimeSaving(true);
    setRuntimeError(null);
    setRuntimeSuccess(null);
    try {
      const payload = {
        openai_embedding_model: runtimeForm.openai_embedding_model.trim() || "text-embedding-3-small",
        openai_moderation_disabled: Boolean(runtimeForm.openai_moderation_disabled),
        clear_openai_api_key: Boolean(runtimeForm.clear_openai_api_key),
      };
      if ((runtimeForm.openai_api_key || "").trim()) {
        payload.openai_api_key = runtimeForm.openai_api_key.trim();
      }
      const updated = await patchAiRuntimeSettings(payload);
      setRuntimeForm((prev) => ({
        ...prev,
        openai_api_key: "",
        clear_openai_api_key: false,
        openai_embedding_model: updated.openai_embedding_model || "text-embedding-3-small",
        openai_moderation_disabled: Boolean(updated.openai_moderation_disabled),
        has_openai_api_key: Boolean(updated.has_openai_api_key),
        openai_api_key_masked: updated.openai_api_key_masked || "",
      }));
      setRuntimeSuccess("Credenciales/configuración runtime guardadas correctamente.");
    } catch (err) {
      const d = err?.response?.data;
      const msg = d?.message || d?.detail || err?.message || "No se pudo guardar la configuración runtime.";
      setRuntimeError(typeof msg === "string" ? msg : "No se pudo guardar la configuración runtime.");
    } finally {
      setRuntimeSaving(false);
    }
  };

  if (!canEdit) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app-page app-page-narrow">
      <div className="mb-3">
        <Link to="/">← Inicio</Link>
      </div>
      <h1 className="h4 mb-3">Configuración de IA (chat)</h1>
      <p className="text-muted small">
        Aquí puedes configurar runtime de OpenAI sin reiniciar el servidor y definir perfiles de prompt/modelo.
        La prueba sandbox usa solo el system prompt y tu mensaje (sin CRM ni RAG).
      </p>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <>
          <div className="border rounded p-3 bg-body-tertiary mb-3">
            <h2 className="h6 mb-2">Runtime OpenAI (sin reinicio)</h2>
            <p className="small text-muted mb-2">
              Si guardas una API key aquí, el backend la usa en caliente inmediatamente.
            </p>
            <Form onSubmit={handleSaveRuntime}>
              <Form.Group className="mb-2">
                <Form.Label>API Key OpenAI</Form.Label>
                <Form.Control
                  type="password"
                  placeholder={runtimeForm.has_openai_api_key ? "Dejar vacío para conservar la actual" : "sk-..."}
                  value={runtimeForm.openai_api_key}
                  onChange={(e) => setRuntimeForm((prev) => ({ ...prev, openai_api_key: e.target.value }))}
                />
                {runtimeForm.openai_api_key_masked && (
                  <div className="small text-muted mt-1">
                    Clave actual: {runtimeForm.openai_api_key_masked}
                  </div>
                )}
                <Form.Check
                  className="mt-2"
                  type="checkbox"
                  id="clear-openai-key"
                  label="Eliminar API key guardada en base de datos"
                  checked={runtimeForm.clear_openai_api_key}
                  onChange={(e) => setRuntimeForm((prev) => ({ ...prev, clear_openai_api_key: e.target.checked }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Modelo de embeddings (RAG)</Form.Label>
                <Form.Control
                  value={runtimeForm.openai_embedding_model}
                  onChange={(e) => setRuntimeForm((prev) => ({ ...prev, openai_embedding_model: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Check
                  type="switch"
                  id="runtime-mod-disabled"
                  label="Deshabilitar moderación OpenAI globalmente (runtime)"
                  checked={runtimeForm.openai_moderation_disabled}
                  onChange={(e) =>
                    setRuntimeForm((prev) => ({ ...prev, openai_moderation_disabled: e.target.checked }))
                  }
                />
              </Form.Group>
              <div className="d-flex gap-2 align-items-center">
                <Button type="submit" size="sm" disabled={runtimeSaving}>
                  {runtimeSaving ? "Guardando…" : "Guardar runtime"}
                </Button>
                {runtimeSuccess && <span className="small text-success">{runtimeSuccess}</span>}
              </div>
              {runtimeError && <Alert variant="warning" className="mt-2 mb-0 small">{runtimeError}</Alert>}
            </Form>
          </div>

          <div className="d-flex gap-2 mb-3 flex-wrap">
            <Button type="button" variant="outline-primary" size="sm" onClick={() => void handleNew()} disabled={saving}>
              Nueva configuración
            </Button>
          </div>
          <Table responsive hover size="sm" className="mb-3">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Modelo</th>
                <th>Predeterminada</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className={row.id === selectedId ? "table-primary" : ""}
                  onClick={() => handleSelect(row)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      handleSelect(row);
                    }
                  }}
                >
                  <td>{row.name}</td>
                  <td>{row.llm_model}</td>
                  <td>{row.is_default ? "Sí" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>

          {selectedId && (
            <Form onSubmit={handleSubmit} className="mb-4">
              <Form.Group className="mb-2">
                <Form.Label>Nombre</Form.Label>
                <Form.Control
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>System prompt</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={6}
                  value={form.system_prompt}
                  onChange={(e) => setForm((p) => ({ ...p, system_prompt: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Modelo LLM</Form.Label>
                <Form.Control
                  value={form.llm_model}
                  onChange={(e) => setForm((p) => ({ ...p, llm_model: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Temperatura</Form.Label>
                <Form.Control
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  value={form.temperature}
                  onChange={(e) => setForm((p) => ({ ...p, temperature: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Máx. tokens respuesta</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={4096}
                  value={form.max_tokens}
                  onChange={(e) => setForm((p) => ({ ...p, max_tokens: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Mensajes de historial en el prompt</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={50}
                  value={form.max_history_messages}
                  onChange={(e) => setForm((p) => ({ ...p, max_history_messages: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Check
                  type="switch"
                  id="cfg-default"
                  label="Configuración predeterminada del sistema"
                  checked={form.is_default}
                  onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Check
                  type="switch"
                  id="mod-enabled"
                  label="Moderación OpenAI (respuestas)"
                  checked={form.moderation_enabled}
                  onChange={(e) => setForm((p) => ({ ...p, moderation_enabled: e.target.checked }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Check
                  type="switch"
                  id="rag-enabled"
                  label="RAG: usar documentos CRM del contacto en el prompt"
                  checked={form.rag_enabled}
                  onChange={(e) => setForm((p) => ({ ...p, rag_enabled: e.target.checked }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Chunks RAG (top-K)</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={20}
                  value={form.rag_top_k}
                  onChange={(e) => setForm((p) => ({ ...p, rag_top_k: e.target.value }))}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Cuota diaria de tokens por conversación (UTC)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  step={1000}
                  value={form.daily_token_budget_per_conversation}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, daily_token_budget_per_conversation: e.target.value }))
                  }
                />
              </Form.Group>
              <div className="d-flex gap-2 flex-wrap">
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
                <Button type="button" variant="outline-danger" disabled={saving} onClick={() => void handleDelete()}>
                  Desactivar
                </Button>
              </div>
            </Form>
          )}

          {selectedId && (
            <div className="border rounded p-3 bg-body-secondary">
              <h2 className="h6 mb-2">Probar respuesta (sandbox)</h2>
              <Form onSubmit={handleTest}>
                <Form.Group className="mb-2">
                  <Form.Label>Mensaje de prueba</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                  />
                </Form.Group>
                <Button type="submit" size="sm" disabled={testLoading}>
                  {testLoading ? "Generando…" : "Enviar prueba"}
                </Button>
              </Form>
              {testError && <Alert variant="warning" className="mt-2 mb-0 small">{testError}</Alert>}
              {testReply && (
                <div className="mt-2 small">
                  <strong>Respuesta:</strong>
                  <pre className="mt-1 mb-1 p-2 bg-body border rounded" style={{ whiteSpace: "pre-wrap" }}>
                    {testReply}
                  </pre>
                  {testMeta && (
                    <span className="text-muted">
                      Tokens: {testMeta.total_tokens} (prompt {testMeta.prompt_tokens}, completion{" "}
                      {testMeta.completion_tokens})
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AIConfigPage;
