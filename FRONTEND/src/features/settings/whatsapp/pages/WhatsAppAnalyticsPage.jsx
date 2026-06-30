import { useEffect, useState } from "react";
import { Card, Table } from "react-bootstrap";

import { fetchWhatsAppAnalytics } from "../../../../api/whatsapp.js";

const WhatsAppAnalyticsPage = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchWhatsAppAnalytics().then(setData).catch(() => setData(null));
  }, []);

  const kpi = data || {};

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">WhatsApp</div>
          <h1 className="h3 mb-1">Analítica de mensajería</h1>
          <p className="text-muted mb-0">Monitorea volumen, entrega, lectura y uso de templates desde un mismo tablero.</p>
        </div>
      </div>

      <div className="app-kpi-grid mb-4">
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Volumen</span>
          <div className="app-kpi-value">{kpi.messages_sent || 0}</div>
          <p className="text-muted mb-0">Mensajes enviados</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Inbound</span>
          <div className="app-kpi-value">{kpi.messages_received || 0}</div>
          <p className="text-muted mb-0">Mensajes recibidos</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Calidad</span>
          <div className="app-kpi-value">{kpi.delivery_rate || 0}%</div>
          <p className="text-muted mb-0">Tasa de entrega</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Engagement</span>
          <div className="app-kpi-value">{kpi.read_rate || 0}%</div>
          <p className="text-muted mb-0">Tasa de lectura</p>
        </article>
      </div>

      <Card className="app-surface app-surface-padded">
        <Card.Body>
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Templates</div>
              <h2 className="h6 mb-0">Plantillas más usadas</h2>
            </div>
            <div className="app-inline-stat">
              <span className="app-inline-stat-label">Registros</span>
              <strong>{(kpi.templates_usage || []).length}</strong>
            </div>
          </div>
          <div className="app-table-shell">
            <Table size="sm" responsive className="mb-0 app-table-clean">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(kpi.templates_usage || []).map((r) => (
                  <tr key={r.metadata__template_id || Math.random()}>
                    <td>{r.metadata__template_id || "—"}</td>
                    <td>{r.total}</td>
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

export default WhatsAppAnalyticsPage;
