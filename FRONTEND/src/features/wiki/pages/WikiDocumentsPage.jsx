import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Row, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import {
  createWikiDocument,
  deleteWikiDocument,
  fetchWikiDocuments,
  updateWikiDocument,
} from "../../../api/wiki.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const emptyForm = {
  title: "",
  slug: "",
  menu_order: 0,
  is_published: true,
  html_content: "",
};

const WikiDocumentsPage = () => {
  const { hasModuleAccess } = useAuth();
  const canEdit = hasModuleAccess("wiki", "edit");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyForm);

  const parseApiError = (err, fallback) => {
    const data = err?.response?.data;
    const payload = data?.data ?? data ?? {};
    const fieldErrors = payload?.errors;
    if (fieldErrors && typeof fieldErrors === "object") {
      const firstKey = Object.keys(fieldErrors)[0];
      const firstVal = firstKey ? fieldErrors[firstKey] : null;
      if (Array.isArray(firstVal) && firstVal.length) {
        return `${firstKey}: ${String(firstVal[0])}`;
      }
      if (typeof firstVal === "string" && firstVal.trim()) {
        return `${firstKey}: ${firstVal}`;
      }
    }
    if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail;
    if (
      typeof payload?.message === "string"
      && payload.message.trim()
      && payload.message.trim().toLowerCase() !== "validation error."
    ) {
      return payload.message;
    }
    if (payload && typeof payload === "object") {
      const firstKey = Object.keys(payload)[0];
      const firstVal = firstKey ? payload[firstKey] : null;
      if (Array.isArray(firstVal) && firstVal.length) return String(firstVal[0]);
      if (typeof firstVal === "string" && firstVal.trim()) return firstVal;
    }
    return fallback;
  };

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const load = async () => {
    try {
      const data = await fetchWikiDocuments({ page_size: 200 });
      setRows(data.results || []);
    } catch {
      setError("No se pudieron cargar los documentos wiki.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) {
      setForm(emptyForm);
      return;
    }
    setForm({
      title: selected.title || "",
      slug: selected.slug || "",
      menu_order: selected.menu_order ?? 0,
      is_published: Boolean(selected.is_published),
      html_content: selected.html_content || "",
    });
  }, [selected]);

  const resetForm = () => {
    setSelectedId("");
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        menu_order: Number(form.menu_order || 0),
      };
      if (selectedId) {
        await updateWikiDocument(selectedId, payload);
      } else {
        await createWikiDocument(payload);
      }
      await load();
      resetForm();
    } catch (err) {
      setError(parseApiError(err, "No se pudo guardar el documento."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || !selectedId) return;
    if (!window.confirm("¿Eliminar este documento wiki?")) return;
    setError("");
    try {
      await deleteWikiDocument(selectedId);
      await load();
      resetForm();
    } catch (err) {
      setError(parseApiError(err, "No se pudo eliminar el documento."));
    }
  };

  return (
    <div className="app-page">
      <div className="d-flex justify-content-between align-items-center mb-3 app-page-header">
        <h1 className="h4 mb-0">Wiki · Gestión</h1>
        <Button variant="outline-secondary" onClick={resetForm}>
          Nuevo documento
        </Button>
      </div>
      {error && <Alert variant="danger" className="py-2">{error}</Alert>}
      <Row className="g-3">
        <Col lg={7}>
          <Card className="app-card">
            <Card.Body>
              <Table size="sm" responsive hover>
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Slug</th>
                    <th>Orden</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      onClick={() => setSelectedId(row.id)}
                      className={row.id === selectedId ? "table-primary" : ""}
                    >
                      <td>{row.title}</td>
                      <td className="text-muted">{row.slug}</td>
                      <td>{row.menu_order}</td>
                      <td>
                        {row.is_published ? <Badge bg="success">Publicado</Badge> : <Badge bg="secondary">Borrador</Badge>}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={4} className="text-muted">No hay documentos wiki.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="app-card">
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-2">
                  <Form.Label>Título</Form.Label>
                  <Form.Control
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    required
                    disabled={!canEdit}
                  />
                </Form.Group>
                <Row className="g-2 mb-2">
                  <Col sm={8}>
                    <Form.Group>
                      <Form.Label>Slug (opcional)</Form.Label>
                      <Form.Control
                        value={form.slug}
                        onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
                        placeholder="se-autogenera-si-vacio"
                        disabled={!canEdit}
                      />
                    </Form.Group>
                  </Col>
                  <Col sm={4}>
                    <Form.Group>
                      <Form.Label>Orden</Form.Label>
                      <Form.Control
                        type="number"
                        value={form.menu_order}
                        onChange={(e) => setForm((prev) => ({ ...prev, menu_order: e.target.value }))}
                        disabled={!canEdit}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-2">
                  <Form.Check
                    type="switch"
                    label="Publicado"
                    checked={form.is_published}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                    disabled={!canEdit}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>HTML</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={12}
                    value={form.html_content}
                    onChange={(e) => setForm((prev) => ({ ...prev, html_content: e.target.value }))}
                    placeholder="<h1>Título</h1><p>Contenido...</p>"
                    required
                    disabled={!canEdit}
                  />
                  <Form.Text className="text-muted">
                    El HTML se renderiza tal cual en la página pública del documento.
                  </Form.Text>
                </Form.Group>
                <div className="d-flex gap-2">
                  {canEdit && (
                    <Button type="submit" disabled={saving}>
                      {selectedId ? "Guardar cambios" : "Crear documento"}
                    </Button>
                  )}
                  {selected?.slug && (
                    <Button as={Link} variant="outline-primary" to={`/wiki/${selected.slug}`} target="_blank">
                      Ver página
                    </Button>
                  )}
                  {canEdit && selectedId && (
                    <Button type="button" variant="outline-danger" onClick={handleDelete}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default WikiDocumentsPage;
