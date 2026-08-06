import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal } from "react-bootstrap";

import { createDealCall } from "../../../api/crm.js";

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

const LogDealCallModal = ({ show, deal, onHide, onLogged }) => {
  const [notes, setNotes] = useState("");
  const [calledAt, setCalledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    setNotes("");
    setCalledAt("");
    setError("");
  }, [show, deal?.id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deal?.id) return;
    if (!notes.trim()) {
      setError("La nota de la llamada es obligatoria.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { notes: notes.trim() };
      if (calledAt) {
        payload.called_at = new Date(calledAt).toISOString();
      }
      const created = await createDealCall(deal.id, payload);
      onLogged?.(created, deal);
      onHide?.();
    } catch (err) {
      setError(extractApiError(err, "No se pudo registrar la llamada."));
    } finally {
      setSaving(false);
    }
  };

  const dealLabel = deal?.title || deal?.contact_name || "deal";

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Registrar llamada</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-3">
          <div className="small text-muted">Deal: <strong>{dealLabel}</strong></div>
          {error ? <Alert variant="danger" className="py-2 mb-0">{error}</Alert> : null}
          <Form.Group>
            <Form.Label>Notas de la llamada</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resumen de lo conversado..."
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>Fecha y hora (opcional)</Form.Label>
            <Form.Control
              type="datetime-local"
              value={calledAt}
              onChange={(e) => setCalledAt(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Registrando..." : "Registrar llamada"}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

LogDealCallModal.propTypes = {
  show: PropTypes.bool.isRequired,
  deal: PropTypes.object,
  onHide: PropTypes.func,
  onLogged: PropTypes.func,
};

LogDealCallModal.defaultProps = {
  deal: null,
  onHide: undefined,
  onLogged: undefined,
};

export default LogDealCallModal;
