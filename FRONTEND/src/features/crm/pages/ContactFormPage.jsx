import { useEffect, useState } from "react";
import { Button, Col, Form, Row, Spinner } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";

import { createContact, fetchContact, updateContact } from "../../../api/crm.js";
import CompanySelector from "../components/CompanySelector.jsx";

const ContactFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [companyLabel, setCompanyLabel] = useState("");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    whatsapp_number: "",
    company: "",
    position: "",
    source: "other",
    intent_level: "cold",
    lifecycle_stage: "new_lead",
    notes: "",
    tags: "",
  });

  useEffect(() => {
    if (!isEdit) return;
    fetchContact(id)
      .then((c) => {
        setForm({
          first_name: c.first_name || "",
          last_name: c.last_name || "",
          email: c.email || "",
          phone_number: c.phone_number || "",
          whatsapp_number: c.whatsapp_number || "",
          company: c.company || "",
          position: c.position || "",
          source: c.source || "other",
          intent_level: c.intent_level || "cold",
          lifecycle_stage: c.lifecycle_stage || "new_lead",
          notes: c.notes || "",
          tags: Array.isArray(c.tags) ? c.tags.join(", ") : "",
        });
        setCompanyLabel(c.company_name || "");
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      tags: form.tags
        ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [],
      custom_fields: {},
    };
    if (!payload.company) delete payload.company;
    try {
      if (isEdit) {
        await updateContact(id, payload);
      } else {
        const created = await createContact(payload);
        navigate(`/crm/contacts/${created.id}`);
        return;
      }
      navigate(`/crm/contacts/${id}`);
    } catch {
      alert("No se pudo guardar el contacto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link to="/crm/contacts">← Volver a contactos</Link>
      </div>
      <h1 className="h4 mb-4">{isEdit ? "Editar contacto" : "Nuevo contacto"}</h1>
      <Form onSubmit={handleSubmit}>
        <Row className="g-3">
          <Col md={6}>
            <Form.Group>
              <Form.Label>Nombre</Form.Label>
              <Form.Control name="first_name" value={form.first_name} onChange={handleChange} required />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Apellido</Form.Label>
              <Form.Control name="last_name" value={form.last_name} onChange={handleChange} required />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Teléfono</Form.Label>
              <Form.Control name="phone_number" value={form.phone_number} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>WhatsApp</Form.Label>
              <Form.Control name="whatsapp_number" value={form.whatsapp_number} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Empresa</Form.Label>
              <CompanySelector
                value={form.company}
                initialLabel={companyLabel}
                onChange={(companyId) => {
                  setForm((prev) => ({ ...prev, company: companyId || "" }));
                }}
                disabled={saving}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label>Cargo</Form.Label>
              <Form.Control name="position" value={form.position} onChange={handleChange} />
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Origen</Form.Label>
              <Form.Select name="source" value={form.source} onChange={handleChange}>
                <option value="website">Web</option>
                <option value="referral">Referido</option>
                <option value="social_media">Redes</option>
                <option value="cold_call">Cold call</option>
                <option value="event">Evento</option>
                <option value="other">Otro</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Intención</Form.Label>
              <Form.Select name="intent_level" value={form.intent_level} onChange={handleChange}>
                <option value="cold">Cold</option>
                <option value="warm">Warm</option>
                <option value="hot">Hot</option>
                <option value="very_hot">Very hot</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group>
              <Form.Label>Etapa</Form.Label>
              <Form.Select name="lifecycle_stage" value={form.lifecycle_stage} onChange={handleChange}>
                <option value="new_lead">Nuevo lead</option>
                <option value="contacted">Contactado</option>
                <option value="qualified">Calificado</option>
                <option value="proposal">Propuesta</option>
                <option value="negotiation">Negociación</option>
                <option value="won">Ganado</option>
                <option value="lost">Perdido</option>
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Notas</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="notes"
                value={form.notes}
                onChange={handleChange}
              />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group>
              <Form.Label>Etiquetas (separadas por coma)</Form.Label>
              <Form.Control name="tags" value={form.tags} onChange={handleChange} />
            </Form.Group>
          </Col>
        </Row>
        <div className="mt-4">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default ContactFormPage;
