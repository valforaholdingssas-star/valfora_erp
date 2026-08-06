import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal } from "react-bootstrap";

import { updateDeal } from "../../../api/crm.js";
import { resolveUserDisplayName } from "../utils/formatters.js";

const DEAL_SOURCES = [
  ["whatsapp", "WhatsApp"],
  ["manual", "Manual"],
  ["website", "Website"],
  ["referral", "Referido"],
  ["other", "Otro"],
];

const emptyForm = {
  title: "",
  stage: "",
  value: "",
  probability: 0,
  assigned_to: "",
  company: "",
  source: "other",
  expected_close_date: "",
  business_notes: "",
  description: "",
};

const extractApiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const first = err?.response?.data?.data ?? err?.response?.data;
  if (first && typeof first === "object") {
    const firstValue = Object.values(first)[0];
    if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
    if (typeof firstValue === "string" && firstValue.trim()) return firstValue;
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
};

const QuickEditDealModal = ({ show, deal, users, companies, stages, onHide, onSaved }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show || !deal) return;
    setError("");
    setForm({
      title: deal.title || "",
      stage: deal.stage || "",
      value: deal.value ?? "",
      probability: deal.probability ?? 0,
      assigned_to: deal.assigned_to || "",
      company: deal.company || "",
      source: deal.source || "other",
      expected_close_date: deal.expected_close_date || "",
      business_notes: deal.business_notes || "",
      description: deal.description || "",
    });
  }, [show, deal]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deal?.id) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateDeal(deal.id, {
        title: form.title.trim(),
        stage: form.stage,
        value: form.value === "" ? 0 : Number(form.value),
        probability: Number(form.probability || 0),
        assigned_to: form.assigned_to || null,
        company: form.company || null,
        source: form.source || "other",
        expected_close_date: form.expected_close_date || null,
        business_notes: form.business_notes.trim(),
        description: form.description.trim(),
      });
      onSaved?.(updated || { ...deal, ...form });
      onHide?.();
    } catch (err) {
      setError(extractApiError(err, "No se pudo guardar el deal."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Edición rápida</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3">
          {error ? <Alert variant="danger" className="py-2 mb-0">{error}</Alert> : null}
          <Form.Group>
            <Form.Label>Título</Form.Label>
            <Form.Control required value={form.title} onChange={handleChange("title")} />
          </Form.Group>
          <div className="row g-3">
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Etapa</Form.Label>
                <Form.Select value={form.stage} onChange={handleChange("stage")}>
                  {(stages || []).map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.title || stage.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Origen</Form.Label>
                <Form.Select value={form.source} onChange={handleChange("source")}>
                  {DEAL_SOURCES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Valor</Form.Label>
                <Form.Control type="number" min="0" step="0.01" value={form.value} onChange={handleChange("value")} />
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Probabilidad %</Form.Label>
                <Form.Control type="number" min="0" max="100" value={form.probability} onChange={handleChange("probability")} />
              </Form.Group>
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Asignado a</Form.Label>
                <Form.Select value={form.assigned_to} onChange={handleChange("assigned_to")}>
                  <option value="">Sin asignar</option>
                  {(users || []).map((user) => (
                    <option key={user.id} value={user.id}>{resolveUserDisplayName(user)}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group>
                <Form.Label>Empresa</Form.Label>
                <Form.Select value={form.company} onChange={handleChange("company")}>
                  <option value="">Sin empresa</option>
                  {(companies || []).map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <Form.Group>
            <Form.Label>Fecha esperada de cierre</Form.Label>
            <Form.Control type="date" value={form.expected_close_date} onChange={handleChange("expected_close_date")} />
          </Form.Group>
          <Form.Group>
            <Form.Label>Notas comerciales</Form.Label>
            <Form.Control as="textarea" rows={3} value={form.business_notes} onChange={handleChange("business_notes")} />
          </Form.Group>
          <Form.Group>
            <Form.Label>Descripción</Form.Label>
            <Form.Control as="textarea" rows={3} value={form.description} onChange={handleChange("description")} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

QuickEditDealModal.propTypes = {
  show: PropTypes.bool.isRequired,
  deal: PropTypes.object,
  users: PropTypes.arrayOf(PropTypes.object),
  companies: PropTypes.arrayOf(PropTypes.object),
  stages: PropTypes.arrayOf(PropTypes.object),
  onHide: PropTypes.func,
  onSaved: PropTypes.func,
};

QuickEditDealModal.defaultProps = {
  deal: null,
  users: [],
  companies: [],
  stages: [],
  onHide: undefined,
  onSaved: undefined,
};

export default QuickEditDealModal;
