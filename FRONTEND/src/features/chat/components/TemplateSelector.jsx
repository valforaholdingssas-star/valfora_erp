import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";

import { fetchApprovedTemplates } from "../../../api/whatsapp.js";

const TemplateSelector = ({ show, onHide, onSend }) => {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState([""]);

  useEffect(() => {
    if (!show) return;
    fetchApprovedTemplates({ page_size: 100 })
      .then((data) => {
        const list = data.results || [];
        setTemplates(list);
        setTemplateId(list[0]?.id || "");
      })
      .catch(() => {
        setTemplates([]);
        setTemplateId("");
      });
  }, [show]);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Enviar plantilla</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Select className="mb-2" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
        </Form.Select>
        {variables.map((value, i) => (
          <Form.Control
            key={i}
            className="mb-2"
            placeholder={`Variable {{${i + 1}}}`}
            value={value}
            onChange={(e) => {
              const next = [...variables];
              next[i] = e.target.value;
              setVariables(next);
            }}
          />
        ))}
        <Button size="sm" variant="outline-secondary" onClick={() => setVariables((prev) => [...prev, ""])}>
          + Variable
        </Button>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>Cancelar</Button>
        <Button onClick={() => onSend(templateId, variables.filter(Boolean))} disabled={!templateId}>Enviar</Button>
      </Modal.Footer>
    </Modal>
  );
};

TemplateSelector.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  onSend: PropTypes.func.isRequired,
};

export default TemplateSelector;
