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
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">WhatsApp</div>
          <h1 className="h3 mb-1">Perfil de negocio</h1>
          <p className="text-muted mb-0">Mantén sincronizada la identidad visible de la cuenta en Meta y en el canal operativo.</p>
        </div>
      </div>
      {saved && <Alert variant="success" className="py-2 app-surface-subtle">Perfil actualizado.</Alert>}
      <Card className="app-surface app-surface-padded">
        <Card.Body>
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Identidad</div>
              <h2 className="h6 mb-0">Información pública del negocio</h2>
            </div>
          </div>
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
