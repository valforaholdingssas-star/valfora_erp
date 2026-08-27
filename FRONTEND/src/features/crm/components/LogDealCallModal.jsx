import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Form, Modal } from "react-bootstrap";

import { createDealCall, moveDealStage } from "../../../api/crm.js";

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

const OUTCOME_PRESETS = [
  { value: "", label: "Dejar en Realizar llamada" },
  { value: "closed_lost", label: "Cerrar lead (Perdido)" },
  { value: "closed_won", label: "Cerrar lead (Ganado)" },
  { value: "unanswered", label: "Sin respuesta" },
];

const LogDealCallModal = ({ show, deal, stages = [], onHide, onLogged }) => {
  const [notes, setNotes] = useState("");
  const [calledAt, setCalledAt] = useState("");
  const [nextStage, setNextStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const stageOptions = useMemo(() => {
    const presetKeys = new Set(OUTCOME_PRESETS.map((item) => item.value).filter(Boolean));
    const extras = (stages || [])
      .filter((stage) => {
        const key = stage.id || stage.key;
        return key && key !== "realizar_llamada" && !presetKeys.has(key);
      })
      .map((stage) => ({
        value: stage.id || stage.key,
        label: stage.title || stage.name || stage.id,
      }));
    return [
      ...OUTCOME_PRESETS,
      ...extras,
    ];
  }, [stages]);

  useEffect(() => {
    if (!show) return;
    setNotes("");
    setCalledAt("");
    setNextStage("");
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
      let updatedDeal = deal;
      if (nextStage && nextStage !== deal.stage) {
        updatedDeal = await moveDealStage(deal.id, {
          to_stage: nextStage,
          notes: `Movido tras registrar llamada → ${nextStage}`,
        });
      }
      onLogged?.(created, updatedDeal || deal);
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
          <Form.Group>
            <Form.Label>Después de la llamada, mover a</Form.Label>
            <Form.Select value={nextStage} onChange={(e) => setNextStage(e.target.value)}>
              {stageOptions.map((option) => (
                <option key={option.value || "stay"} value={option.value}>{option.label}</option>
              ))}
            </Form.Select>
            <Form.Text className="text-muted">
              Usa &quot;Cerrar lead (Perdido)&quot; para sacar el deal del escritorio de llamadas.
            </Form.Text>
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
  stages: PropTypes.arrayOf(PropTypes.object),
  onHide: PropTypes.func,
  onLogged: PropTypes.func,
};

LogDealCallModal.defaultProps = {
  deal: null,
  stages: [],
  onHide: undefined,
  onLogged: undefined,
};

export default LogDealCallModal;
