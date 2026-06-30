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
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">WhatsApp</div>
          <h1 className="h3 mb-1">Templates</h1>
          <p className="text-muted mb-0">Centraliza plantillas, estado de aprobación y sincronización con Meta.</p>
        </div>
        <div className="app-action-cluster">
          <Button variant="outline-primary" onClick={async () => { await syncWhatsAppTemplates({}); setTimeout(load, 1000); }}>Sincronizar con Meta</Button>
          <Button as={Link} to="/settings/whatsapp/templates/new">Nuevo template</Button>
        </div>
      </div>
      <Card className="app-surface app-surface-padded">
        <Card.Body>
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Biblioteca</div>
              <h2 className="h6 mb-0">Templates configurados</h2>
            </div>
            <div className="app-inline-stat">
              <span className="app-inline-stat-label">Total</span>
              <strong>{rows.length}</strong>
            </div>
          </div>
          <div className="app-table-shell">
            <Table size="sm" responsive className="mb-0 app-table-clean">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Idioma</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.category}</td>
                    <td>{r.language}</td>
                    <td><TemplateStatusBadge status={r.status} /></td>
                    <td>
                      <div className="d-flex flex-wrap gap-2">
                        <Button size="sm" variant="outline-secondary" as={Link} to={`/settings/whatsapp/templates/${r.id}/edit`}>Editar</Button>
                        <Button size="sm" variant="outline-success" onClick={async () => { await submitWhatsAppTemplate(r.id); load(); }}>Enviar aprobación</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppTemplatesPage;
