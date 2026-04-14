import { useEffect, useState } from "react";
import { Button, Card, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchWhatsAppTemplates, submitWhatsAppTemplate, syncWhatsAppTemplates } from "../../../../api/whatsapp.js";
import TemplateStatusBadge from "../components/TemplateStatusBadge.jsx";

const WhatsAppTemplatesPage = () => {
  const [rows, setRows] = useState([]);

  const load = () => {
    fetchWhatsAppTemplates({ page_size: 100 }).then((d) => setRows(d.results || []));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="app-page">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">WhatsApp · Templates</h1>
        <div className="d-flex gap-2">
          <Button variant="outline-primary" onClick={async () => { await syncWhatsAppTemplates({}); setTimeout(load, 1000); }}>Sincronizar con Meta</Button>
          <Button as={Link} to="/settings/whatsapp/templates/new">Nuevo template</Button>
        </div>
      </div>
      <Card>
        <Card.Body>
          <Table size="sm" responsive>
            <thead><tr><th>Nombre</th><th>Categoría</th><th>Idioma</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.category}</td>
                  <td>{r.language}</td>
                  <td><TemplateStatusBadge status={r.status} /></td>
                  <td>
                    <Button size="sm" variant="outline-secondary" as={Link} to={`/settings/whatsapp/templates/${r.id}/edit`}>Editar</Button>{" "}
                    <Button size="sm" variant="outline-success" onClick={async () => { await submitWhatsAppTemplate(r.id); load(); }}>Enviar aprobación</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppTemplatesPage;
