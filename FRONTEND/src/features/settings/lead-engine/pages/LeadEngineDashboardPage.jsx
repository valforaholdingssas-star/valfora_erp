import { useEffect, useState } from "react";
import { Card, Col, Row, Spinner } from "react-bootstrap";

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
      <h1 className="h4 mb-3">Dashboard de Automatización</h1>
      <Row className="g-3">
        <Col md={4}>
          <Card><Card.Body><LeadSourceChart data={data.kpis} /></Card.Body></Card>
        </Col>
        <Col md={4}>
          <Card>
            <Card.Body>
              <div className="small"><strong>Movimientos automáticos:</strong> {data.kpis?.auto_deal_moves ?? 0}</div>
              <div className="small"><strong>Movimientos manuales:</strong> {data.kpis?.manual_deal_moves ?? 0}</div>
              <div className="small"><strong>Deals stale:</strong> {data.kpis?.stale_deals ?? 0}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card><Card.Body><ConversionFunnelChart data={data.conversion_funnel} /></Card.Body></Card>
        </Col>
      </Row>
    </div>
  );
};

export default LeadEngineDashboardPage;
