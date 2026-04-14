import PropTypes from "prop-types";
import { useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";

const CreateActivityModal = ({ show, selectedDate, contacts, onSubmit, onHide }) => {
  const [form, setForm] = useState({
    contact: "",
    subject: "",
    activity_type: "task",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.contact) return;
    setSaving(true);
    try {
      await onSubmit({
        contact: form.contact,
        subject: form.subject,
        activity_type: form.activity_type,
        description: form.description,
        due_date: selectedDate,
      });
      setForm({
        contact: "",
        subject: "",
        activity_type: "task",
        description: "",
      });
      onHide();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title>Nueva actividad</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-2">
          <Form.Select
            value={form.contact}
            onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
            required
          >
            <option value="">Selecciona un contacto</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.first_name} {contact.last_name} · {contact.email}
              </option>
            ))}
          </Form.Select>
          <Form.Control
            value={form.subject}
            onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            placeholder="Asunto"
            required
          />
          <Form.Select
            value={form.activity_type}
            onChange={(e) => setForm((prev) => ({ ...prev, activity_type: e.target.value }))}
          >
            <option value="task">Tarea</option>
            <option value="call">Llamada</option>
            <option value="meeting">Reunión</option>
            <option value="email">Email</option>
            <option value="note">Nota</option>
            <option value="whatsapp">WhatsApp</option>
          </Form.Select>
          <Form.Control
            as="textarea"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Descripción"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creando..." : "Crear actividad"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

CreateActivityModal.propTypes = {
  show: PropTypes.bool.isRequired,
  selectedDate: PropTypes.string,
  contacts: PropTypes.arrayOf(PropTypes.object).isRequired,
  onSubmit: PropTypes.func.isRequired,
  onHide: PropTypes.func.isRequired,
};

export default CreateActivityModal;
