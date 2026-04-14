import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";

import { createWhatsAppTemplate, fetchWhatsAppAccounts, fetchWhatsAppTemplates, updateWhatsAppTemplate } from "../../../../api/whatsapp.js";
import TemplatePreview from "../components/TemplatePreview.jsx";
import TemplateVariableForm from "../components/TemplateVariableForm.jsx";

const initialForm = {
  account: "",
  name: "",
  category: "utility",
  language: "es",
  header_type: "none",
  header_content: "",
  body_text: "",
  footer_text: "",
  buttons: [],
  example_values: [],
};

const WhatsAppTemplateForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [vars, setVars] = useState([]);

  useEffect(() => {
    fetchWhatsAppAccounts({ page_size: 100 }).then((d) => {
      const list = d.results || [];
      setAccounts(list);
      if (!editing) setForm((p) => ({ ...p, account: list[0]?.id || "" }));
    });
    if (editing) {
      fetchWhatsAppTemplates({ page_size: 200 }).then((d) => {
        const found = (d.results || []).find((x) => x.id === id);
        if (!found) return;
        setForm({
          account: found.account,
          name: found.name,
          category: found.category,
          language: found.language,
          header_type: found.header_type || "none",
          header_content: found.header_content || "",
          body_text: found.body_text || "",
          footer_text: found.footer_text || "",
          buttons: found.buttons || [],
          example_values: found.example_values || [],
        });
        setVars(found.example_values || []);
      });
    }
  }, [editing, id]);

  const preview = useMemo(() => ({
    header: form.header_type === "text" ? form.header_content : "",
    body: form.body_text,
    footer: form.footer_text,
  }), [form]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, example_values: vars };
    if (editing) {
      await updateWhatsAppTemplate(id, payload);
    } else {
      await createWhatsAppTemplate(payload);
    }
    navigate("/settings/whatsapp/templates");
  };

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">{editing ? "Editar" : "Nuevo"} template</h1>
      <Row>
        <Col lg={7}>
          <Card>
            <Card.Body>
              <Form onSubmit={onSubmit}>
                <Form.Select className="mb-2" value={form.account} onChange={(e) => setForm((p) => ({ ...p, account: e.target.value }))} required>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Form.Select>
                <Form.Control className="mb-2" placeholder="Nombre" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
                <Form.Select className="mb-2" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  <option value="utility">Utility</option><option value="marketing">Marketing</option><option value="authentication">Authentication</option>
                </Form.Select>
                <Form.Control className="mb-2" placeholder="Idioma (es)" value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))} required />
                <Form.Select className="mb-2" value={form.header_type} onChange={(e) => setForm((p) => ({ ...p, header_type: e.target.value }))}>
                  <option value="none">Sin header</option><option value="text">Texto</option><option value="image">Imagen</option><option value="video">Video</option><option value="document">Documento</option>
                </Form.Select>
                {form.header_type !== "none" && <Form.Control className="mb-2" placeholder="Header content" value={form.header_content} onChange={(e) => setForm((p) => ({ ...p, header_content: e.target.value }))} />}
                <Form.Control as="textarea" className="mb-2" rows={4} placeholder="Body" value={form.body_text} onChange={(e) => setForm((p) => ({ ...p, body_text: e.target.value }))} required />
                <Form.Control className="mb-2" placeholder="Footer" value={form.footer_text} onChange={(e) => setForm((p) => ({ ...p, footer_text: e.target.value }))} />
                <TemplateVariableForm values={vars} setValues={setVars} />
                <Button type="submit" className="mt-3">Guardar</Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <TemplatePreview header={preview.header} body={preview.body} footer={preview.footer} />
        </Col>
      </Row>
    </div>
  );
};

export default WhatsAppTemplateForm;
