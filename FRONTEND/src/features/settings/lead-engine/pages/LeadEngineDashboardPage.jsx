import { useEffect, useState } from "react";
import { Col, Row, Spinner } from "react-bootstrap";

import { fetchLeadEngineDashboard } from "../../../../api/settings.js";
import ConversionFunnelChart from "../components/ConversionFunnelChart.jsx";
import LeadSourceChart from "../components/LeadSourceChart.jsx";

const LeadEngineDashboardPage = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchLeadEngineDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Lead Engine</div>
          <h1 className="h3 mb-1">Dashboard de automatización</h1>
          <p className="text-muted mb-0">Conversiones, orígenes y movimientos automáticos del flujo comercial.</p>
        </div>
      </div>
      <div className="app-kpi-grid mb-4">
        <div className="app-kpi-tile">
          <span className="app-kpi-label">Movimientos automáticos</span>
          <strong className="app-kpi-value">{data.kpis?.auto_deal_moves ?? 0}</strong>
        </div>
        <div className="app-kpi-tile">
          <span className="app-kpi-label">Movimientos manuales</span>
          <strong className="app-kpi-value">{data.kpis?.manual_deal_moves ?? 0}</strong>
        </div>
        <div className="app-kpi-tile">
          <span className="app-kpi-label">Deals stale</span>
          <strong className="app-kpi-value">{data.kpis?.stale_deals ?? 0}</strong>
        </div>
      </div>
      <Row className="g-3">
        <Col md={4}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Origen de leads</h2></div>
            <LeadSourceChart data={data.kpis} />
          </section>
        </Col>
        <Col md={4}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Resumen operativo</h2></div>
            <div className="app-detail-stack">
              <div className="app-detail-row">
                <span>Movimientos automáticos</span>
                <strong>{data.kpis?.auto_deal_moves ?? 0}</strong>
              </div>
              <div className="app-detail-row">
                <span>Movimientos manuales</span>
                <strong>{data.kpis?.manual_deal_moves ?? 0}</strong>
              </div>
              <div className="app-detail-row">
                <span>Deals stale</span>
                <strong>{data.kpis?.stale_deals ?? 0}</strong>
              </div>
            </div>
          </section>
        </Col>
        <Col md={4}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Funnel de conversión</h2></div>
            <ConversionFunnelChart data={data.conversion_funnel} />
          </section>
        </Col>
      </Row>
    </div>
  );
};

export default LeadEngineDashboardPage;
