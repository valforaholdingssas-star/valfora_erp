import { useEffect, useState } from "react";
import { Alert, Button, Card, Form } from "react-bootstrap";

import { fetchWhatsAppProfile, updateWhatsAppProfile } from "../../../../api/whatsapp.js";

const WhatsAppProfilePage = () => {
  const [form, setForm] = useState({ about: "", description: "", email: "", websites: [] });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchWhatsAppProfile()
      .then((data) => {
        const p = (data.data || [])[0] || {};
        setForm({
          about: p.about || "",
          description: p.description || "",
          email: p.email || "",
          websites: p.websites || [],
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">WhatsApp · Perfil de negocio</h1>
      {saved && <Alert variant="success" className="py-2">Perfil actualizado.</Alert>}
      <Card>
        <Card.Body>
          <Form onSubmit={async (e) => {
            e.preventDefault();
            await updateWhatsAppProfile({
              messaging_product: "whatsapp",
              about: form.about,
              description: form.description,
              email: form.email,
              websites: form.websites,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 1200);
          }}>
            <Form.Control className="mb-2" placeholder="About" value={form.about} onChange={(e) => setForm((p) => ({ ...p, about: e.target.value }))} />
            <Form.Control className="mb-2" placeholder="Descripción" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            <Form.Control className="mb-2" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <Form.Control className="mb-2" placeholder="Web" value={form.websites?.[0] || ""} onChange={(e) => setForm((p) => ({ ...p, websites: [e.target.value] }))} />
            <Button type="submit">Guardar</Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppProfilePage;
