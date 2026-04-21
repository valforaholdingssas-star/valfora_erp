import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
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
import { deleteDocument, fetchDocuments, uploadDocument } from "../../../api/crm.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const emptyForm = () => ({
  name: "Nueva configuración",
  system_prompt: "",
  objective: "",
  role: "",
  tone: "",
  style: "",
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

const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "gpt-4o-mini (rápido/económico)" },
  { value: "gpt-4o", label: "gpt-4o (calidad balanceada)" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini (instrucciones fuertes)" },
  { value: "gpt-4.1", label: "gpt-4.1 (mayor calidad)" },
];

const toNumberOr = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseApiError = (err, fallback) => {
  if (err?.response?.status === 413) {
    return "El archivo excede el tamaño máximo permitido por el servidor (110 MB).";
  }
  const d = err?.response?.data;
  if (typeof d?.message === "string" && d.message.trim()) return d.message;
  if (typeof d?.detail === "string" && d.detail.trim()) return d.detail;
  if (d && typeof d === "object") {
    const first = Object.keys(d)[0];
    const value = first ? d[first] : null;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
};

const AIConfigPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
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
    global_ai_mode_enabled: false,
    has_openai_api_key: false,
    openai_api_key_masked: "",
  });
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [knowledgeUploadFile, setKnowledgeUploadFile] = useState(null);
  const [knowledgeDocName, setKnowledgeDocName] = useState("");
  const [knowledgeDocDescription, setKnowledgeDocDescription] = useState("");
  const [knowledgeSaving, setKnowledgeSaving] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState(null);

  const canEdit = user && ["admin", "super_admin"].includes(user.role);

  const selectedRow = useMemo(
    () => items.find((row) => row.id === selectedId) || null,
    [items, selectedId],
  );

  const isKnownModel = useMemo(
    () => MODEL_OPTIONS.some((opt) => opt.value === form.llm_model),
    [form.llm_model],
  );

  const effectivePromptPreview = useMemo(() => {
    const blocks = [];
    if ((form.role || "").trim()) blocks.push(`Rol: ${form.role.trim()}`);
    if ((form.objective || "").trim()) blocks.push(`Objetivo: ${form.objective.trim()}`);
    if ((form.tone || "").trim()) blocks.push(`Tono: ${form.tone.trim()}`);
    if ((form.style || "").trim()) blocks.push(`Estilo: ${form.style.trim()}`);
    if ((form.system_prompt || "").trim()) blocks.push(form.system_prompt.trim());
    if (!blocks.length) {
      return "Eres un asistente comercial profesional. Responde en español, de forma breve y útil.";
    }
    return blocks.join("\n");
  }, [form.objective, form.role, form.style, form.system_prompt, form.tone]);

  const setFormFromRow = useCallback((row) => {
    setForm({
      name: row.name || "",
      system_prompt: row.system_prompt || "",
      objective: row.objective || "",
      role: row.role || "",
      tone: row.tone || "",
      style: row.style || "",
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
      const [data, runtime, docs] = await Promise.all([
        fetchAiConfigurations({ page_size: 100 }),
        fetchAiRuntimeSettings(),
        fetchDocuments({ is_global_knowledge: true, page_size: 200 }),
      ]);
      const rows = data.results || [];
      setItems(rows);
      setKnowledgeDocs(docs.results || []);
      setRuntimeForm((prev) => ({
        ...prev,
        openai_api_key: "",
        clear_openai_api_key: false,
        openai_embedding_model: runtime.openai_embedding_model || "text-embedding-3-small",
        openai_moderation_disabled: Boolean(runtime.openai_moderation_disabled),
        global_ai_mode_enabled: Boolean(runtime.global_ai_mode_enabled),
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
    setSaveSuccess(null);
    setTestReply("");
    setTestMeta(null);
    setTestError(null);
  };

  const handleNew = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(null);
    try {
      const created = await createAiConfiguration({
        ...emptyForm(),
        name: `Agente ${items.length + 1}`,
      });
      await load();
      setSelectedId(created.id);
      setSaveSuccess("Agente creado correctamente.");
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
    setSaveSuccess(null);
    try {
      const payload = {
        name: form.name.trim() || "Sin nombre",
        objective: (form.objective || "").trim(),
        role: (form.role || "").trim(),
        tone: (form.tone || "").trim(),
        style: (form.style || "").trim(),
        system_prompt: (form.system_prompt || "").trim(),
        temperature: toNumberOr(form.temperature, 0.7),
        max_tokens: Math.max(1, Math.floor(toNumberOr(form.max_tokens, 512))),
        llm_model: (form.llm_model || "").trim() || "gpt-4o-mini",
        is_default: Boolean(form.is_default),
        max_history_messages: Math.max(1, Math.floor(toNumberOr(form.max_history_messages, 20))),
        moderation_enabled: Boolean(form.moderation_enabled),
        daily_token_budget_per_conversation: Math.max(
          0,
          Math.floor(toNumberOr(form.daily_token_budget_per_conversation, 100000)),
        ),
        rag_enabled: Boolean(form.rag_enabled),
        rag_top_k: Math.max(1, Math.min(20, Math.floor(toNumberOr(form.rag_top_k, 5)))),
      };
      const updated = await patchAiConfiguration(selectedId, payload);
      setItems((prev) => prev.map((r) => (r.id === selectedId ? { ...r, ...updated } : r)));
      setFormFromRow(updated);
      setSaveSuccess("Cambios guardados. Este agente ya usa los campos Rol/Objetivo/Tono/Estilo en el prompt.");
      await load();
    } catch (err) {
      setError(parseApiError(err, "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm("¿Desactivar esta configuración?")) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(null);
    try {
      await deleteAiConfiguration(selectedId);
      setSelectedId(null);
      setForm(emptyForm());
      await load();
    } catch (err) {
      setError(parseApiError(err, "No se pudo eliminar."));
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
        global_ai_mode_enabled: Boolean(runtimeForm.global_ai_mode_enabled),
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
        global_ai_mode_enabled: Boolean(updated.global_ai_mode_enabled),
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

  const handleUploadKnowledgeDocument = async (e) => {
    e.preventDefault();
    if (!knowledgeUploadFile) {
      setKnowledgeError("Debes seleccionar un archivo.");
      return;
    }
    setKnowledgeSaving(true);
    setKnowledgeError(null);
    try {
      const fd = new FormData();
      fd.append("file", knowledgeUploadFile);
      fd.append("name", (knowledgeDocName || "").trim() || knowledgeUploadFile.name);
      fd.append("description", (knowledgeDocDescription || "").trim());
      fd.append("is_global_knowledge", "true");
      await uploadDocument(fd);
      setKnowledgeUploadFile(null);
      setKnowledgeDocName("");
      setKnowledgeDocDescription("");
      const docs = await fetchDocuments({ is_global_knowledge: true, page_size: 200 });
      setKnowledgeDocs(docs.results || []);
    } catch (err) {
      setKnowledgeError(parseApiError(err, "No se pudo cargar el documento."));
    } finally {
      setKnowledgeSaving(false);
    }
  };

  const handleDeleteKnowledgeDocument = async (docId) => {
    if (!window.confirm("¿Eliminar este documento de conocimiento global?")) return;
    setKnowledgeSaving(true);
    setKnowledgeError(null);
    try {
      await deleteDocument(docId);
      setKnowledgeDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      setKnowledgeError("No se pudo eliminar el documento.");
    } finally {
      setKnowledgeSaving(false);
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
              <Form.Group className="mb-2">
                <Form.Check
                  type="switch"
                  id="runtime-global-ai-enabled"
                  label="Modo IA global para todos los chats (ON/OFF masivo)"
                  checked={runtimeForm.global_ai_mode_enabled}
                  onChange={(e) =>
                    setRuntimeForm((prev) => ({ ...prev, global_ai_mode_enabled: e.target.checked }))
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

          <Row className="g-3 mb-4">
            <Col lg={4}>
              <Card className="h-100">
                <Card.Body>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <h2 className="h6 mb-0">Agentes IA</h2>
                    <Badge bg="secondary">{items.length}</Badge>
                  </div>
                  <div className="d-grid mb-2">
                    <Button
                      type="button"
                      variant="outline-primary"
                      size="sm"
                      onClick={() => void handleNew()}
                      disabled={saving}
                    >
                      + Crear agente
                    </Button>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    {items.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={`btn text-start border ${row.id === selectedId ? "btn-primary" : "btn-light"}`}
                        onClick={() => handleSelect(row)}
                      >
                        <div className="fw-semibold text-truncate">{row.name}</div>
                        <div className="small opacity-75">{row.llm_model}</div>
                        {row.is_default ? <div className="small mt-1">Predeterminado</div> : null}
                      </button>
                    ))}
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={8}>
              {!selectedId ? (
                <Card>
                  <Card.Body>
                    <p className="text-muted mb-0">Crea o selecciona un agente para editar su configuración.</p>
                  </Card.Body>
                </Card>
              ) : (
                <Card>
                  <Card.Body>
                    <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                      <h2 className="h6 mb-0">Editor del agente</h2>
                      <div className="small text-muted">
                        ID: <code>{selectedRow?.id}</code>
                      </div>
                    </div>
                    {saveSuccess && <Alert variant="success" className="py-2">{saveSuccess}</Alert>}
                    <Form onSubmit={handleSubmit}>
                      <Form.Group className="mb-2">
                        <Form.Label>Nombre del agente</Form.Label>
                        <Form.Control
                          value={form.name}
                          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        />
                      </Form.Group>
                      <Form.Group className="mb-2">
                        <Form.Label>Objetivo</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={2}
                          value={form.objective}
                          onChange={(e) => setForm((p) => ({ ...p, objective: e.target.value }))}
                        />
                      </Form.Group>
                      <Row className="g-2 mb-2">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Rol</Form.Label>
                            <Form.Control
                              value={form.role}
                              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Tono</Form.Label>
                            <Form.Control
                              value={form.tone}
                              onChange={(e) => setForm((p) => ({ ...p, tone: e.target.value }))}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                      <Form.Group className="mb-2">
                        <Form.Label>Estilo</Form.Label>
                        <Form.Control
                          value={form.style}
                          onChange={(e) => setForm((p) => ({ ...p, style: e.target.value }))}
                        />
                      </Form.Group>
                      <Form.Group className="mb-2">
                        <Form.Label>System prompt adicional</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={5}
                          value={form.system_prompt}
                          onChange={(e) => setForm((p) => ({ ...p, system_prompt: e.target.value }))}
                        />
                      </Form.Group>
                      <Row className="g-2 mb-2">
                        <Col md={8}>
                          <Form.Group>
                            <Form.Label>Modelo LLM</Form.Label>
                            <Form.Select
                              value={isKnownModel ? form.llm_model : "__custom"}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v !== "__custom") {
                                  setForm((p) => ({ ...p, llm_model: v }));
                                }
                              }}
                            >
                              {MODEL_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                              <option value="__custom">Personalizado…</option>
                            </Form.Select>
                          </Form.Group>
                        </Col>
                        <Col md={4}>
                          <Form.Group>
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
                        </Col>
                      </Row>
                      {!isKnownModel && (
                        <Form.Group className="mb-2">
                          <Form.Label>Modelo personalizado</Form.Label>
                          <Form.Control
                            placeholder="ej: gpt-4.1-mini"
                            value={form.llm_model}
                            onChange={(e) => setForm((p) => ({ ...p, llm_model: e.target.value }))}
                          />
                        </Form.Group>
                      )}
                      <Row className="g-2 mb-2">
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Máx. tokens respuesta</Form.Label>
                            <Form.Control
                              type="number"
                              min={1}
                              max={4096}
                              value={form.max_tokens}
                              onChange={(e) => setForm((p) => ({ ...p, max_tokens: e.target.value }))}
                            />
                          </Form.Group>
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>Historial en prompt</Form.Label>
                            <Form.Control
                              type="number"
                              min={1}
                              max={50}
                              value={form.max_history_messages}
                              onChange={(e) => setForm((p) => ({ ...p, max_history_messages: e.target.value }))}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
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
                      <div className="border rounded p-2 mb-2 bg-body-tertiary">
                        <div className="small fw-semibold mb-1">Prompt efectivo (sí se usa al responder)</div>
                        <pre className="mb-0 small" style={{ whiteSpace: "pre-wrap" }}>
                          {effectivePromptPreview}
                        </pre>
                      </div>
                      <Row className="g-2 mb-2">
                        <Col md={6}>
                          <Form.Check
                            type="switch"
                            id="cfg-default"
                            label="Predeterminado del sistema"
                            checked={form.is_default}
                            onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                          />
                        </Col>
                        <Col md={6}>
                          <Form.Check
                            type="switch"
                            id="mod-enabled"
                            label="Moderación OpenAI"
                            checked={form.moderation_enabled}
                            onChange={(e) => setForm((p) => ({ ...p, moderation_enabled: e.target.checked }))}
                          />
                        </Col>
                      </Row>
                      <Row className="g-2 mb-3">
                        <Col md={6}>
                          <Form.Check
                            type="switch"
                            id="rag-enabled"
                            label="RAG activo"
                            checked={form.rag_enabled}
                            onChange={(e) => setForm((p) => ({ ...p, rag_enabled: e.target.checked }))}
                          />
                        </Col>
                        <Col md={6}>
                          <Form.Group>
                            <Form.Label>RAG top-K</Form.Label>
                            <Form.Control
                              type="number"
                              min={1}
                              max={20}
                              value={form.rag_top_k}
                              onChange={(e) => setForm((p) => ({ ...p, rag_top_k: e.target.value }))}
                            />
                          </Form.Group>
                        </Col>
                      </Row>
                      <div className="d-flex gap-2 flex-wrap">
                        <Button type="submit" disabled={saving}>
                          {saving ? "Guardando…" : "Guardar agente"}
                        </Button>
                        <Button type="button" variant="outline-danger" disabled={saving} onClick={() => void handleDelete()}>
                          Desactivar
                        </Button>
                      </div>
                    </Form>
                  </Card.Body>
                </Card>
              )}
            </Col>
          </Row>

          <div className="border rounded p-3 bg-body-tertiary mb-3">
            <h2 className="h6 mb-2">Contexto IA (RAG optimizado)</h2>
            <p className="small text-muted mb-2">
              Carga documentos como conocimiento global. La IA no envía el documento completo al modelo: recupera solo
              fragmentos relevantes (top-K), reduciendo tokens.
            </p>
            <Form onSubmit={handleUploadKnowledgeDocument}>
              <Form.Group className="mb-2">
                <Form.Label>Archivo</Form.Label>
                <Form.Control
                  type="file"
                  onChange={(e) => setKnowledgeUploadFile(e.target.files?.[0] || null)}
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Nombre visible</Form.Label>
                <Form.Control
                  value={knowledgeDocName}
                  onChange={(e) => setKnowledgeDocName(e.target.value)}
                  placeholder="Opcional (si lo dejas vacío toma el nombre del archivo)"
                />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Descripción</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={knowledgeDocDescription}
                  onChange={(e) => setKnowledgeDocDescription(e.target.value)}
                />
              </Form.Group>
              <Button type="submit" size="sm" disabled={knowledgeSaving}>
                {knowledgeSaving ? "Cargando..." : "Subir documento global"}
              </Button>
            </Form>
            {knowledgeError && <Alert variant="warning" className="mt-2 mb-0 small">{knowledgeError}</Alert>}
            <div className="mt-3">
              <h3 className="h6 mb-2">Documentos globales cargados</h3>
              {knowledgeDocs.length === 0 ? (
                <p className="small text-muted mb-0">No hay documentos globales todavía.</p>
              ) : (
                <div className="d-flex flex-column gap-1">
                  {knowledgeDocs.map((doc) => (
                    <div key={doc.id} className="d-flex justify-content-between align-items-center border rounded px-2 py-1">
                      <div className="small">
                        <strong>{doc.name}</strong>
                        {doc.file_size ? (
                          <span className="text-muted ms-2">
                            {(Number(doc.file_size) / 1024 / 1024).toFixed(2)} MB
                          </span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline-danger"
                        onClick={() => void handleDeleteKnowledgeDocument(doc.id)}
                        disabled={knowledgeSaving}
                      >
                        Eliminar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
