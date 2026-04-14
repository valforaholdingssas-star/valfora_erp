import { useEffect, useState } from "react";
import { Card, Col, Row, Table } from "react-bootstrap";

import { fetchWhatsAppAnalytics } from "../../../../api/whatsapp.js";

const WhatsAppAnalyticsPage = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchWhatsAppAnalytics().then(setData).catch(() => setData(null));
  }, []);

  const kpi = data || {};

  return (
    <div className="app-page">
      <h1 className="h4 mb-3">WhatsApp · Analítica</h1>
      <Row className="g-3 mb-3">
        <Col md={3}><Card><Card.Body><small>Enviados</small><div className="h5 mb-0">{kpi.messages_sent || 0}</div></Card.Body></Card></Col>
        <Col md={3}><Card><Card.Body><small>Recibidos</small><div className="h5 mb-0">{kpi.messages_received || 0}</div></Card.Body></Card></Col>
        <Col md={3}><Card><Card.Body><small>Tasa entrega</small><div className="h5 mb-0">{kpi.delivery_rate || 0}%</div></Card.Body></Card></Col>
        <Col md={3}><Card><Card.Body><small>Tasa lectura</small><div className="h5 mb-0">{kpi.read_rate || 0}%</div></Card.Body></Card></Col>
      </Row>
      <Card>
        <Card.Body>
          <h2 className="h6">Templates más usados</h2>
          <Table size="sm">
            <thead><tr><th>Template</th><th>Total</th></tr></thead>
            <tbody>
              {(kpi.templates_usage || []).map((r) => (
                <tr key={r.metadata__template_id || Math.random()}><td>{r.metadata__template_id || "—"}</td><td>{r.total}</td></tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default WhatsAppAnalyticsPage;
