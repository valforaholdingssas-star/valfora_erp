import { useEffect, useState } from "react";
import { Card, Col, Form, Row, Spinner } from "react-bootstrap";

import AgingChart from "../components/AgingChart.jsx";
import CollectionRateChart from "../components/CollectionRateChart.jsx";
import ExpiringContractsTable from "../components/ExpiringContractsTable.jsx";
import RevenueChart from "../components/RevenueChart.jsx";
import TopClientsChart from "../components/TopClientsChart.jsx";
import { useFinanceDashboard } from "../hooks/useFinanceDashboard.js";

const FinanceDashboard = () => {
  const [period, setPeriod] = useState("year");
  const { data, loading, error, loadDashboard } = useFinanceDashboard();

  useEffect(() => {
    void loadDashboard({ period });
  }, [loadDashboard, period]);

  if (loading && !data) return <Spinner animation="border" />;

  return (
    <div className="app-page">
      <div className="d-flex justify-content-between align-items-center mb-3 app-page-headline flex-wrap gap-2">
        <div>
          <h1 className="h4 mb-1">Dashboard financiero</h1>
          <p className="text-muted mb-0">Indicadores de facturación, recaudo y riesgo de cartera.</p>
        </div>
        <Form.Select
          size="sm"
          style={{ maxWidth: "220px" }}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="month">Mes</option>
          <option value="quarter">Trimestre</option>
          <option value="year">Año</option>
        </Form.Select>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {data?.kpis && (
        <Row className="g-3 mb-3">
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Facturado</p><div className="app-kpi">{data.kpis.invoiced_total}</div></Card.Body></Card></Col>
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Cobrado</p><div className="app-kpi">{data.kpis.paid_total}</div></Card.Body></Card></Col>
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Cartera</p><div className="app-kpi">{data.kpis.receivables_total}</div></Card.Body></Card></Col>
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Vencida</p><div className="app-kpi">{data.kpis.overdue_total}</div></Card.Body></Card></Col>
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Tasa cobro</p><div className="app-kpi">{(data.kpis.collection_rate || 0).toFixed(2)}%</div></Card.Body></Card></Col>
          <Col md={2}><Card className="app-card app-kpi-card"><Card.Body><p className="app-kpi-label mb-1">Contratos activos</p><div className="app-kpi">{data.kpis.active_contracts}</div></Card.Body></Card></Col>
        </Row>
      )}

      <Row className="g-3">
        <Col lg={6}><Card className="app-card app-section-card"><Card.Body><h2 className="h6">Ingresos mensuales</h2><RevenueChart rows={data?.monthly_income || []} /></Card.Body></Card></Col>
        <Col lg={6}><Card className="app-card app-section-card"><Card.Body><h2 className="h6">Aging de cartera</h2><AgingChart aging={data?.aging} /></Card.Body></Card></Col>
        <Col lg={6}><Card className="app-card app-section-card"><Card.Body><h2 className="h6">Top clientes</h2><TopClientsChart rows={data?.top_clients || []} /></Card.Body></Card></Col>
        <Col lg={6}><Card className="app-card app-section-card"><Card.Body><h2 className="h6">Facturado vs cobrado</h2><CollectionRateChart invoiced={data?.billing_vs_collection?.invoiced || 0} collected={data?.billing_vs_collection?.collected || 0} /></Card.Body></Card></Col>
        <Col lg={12}><Card className="app-card app-section-card"><Card.Body><h2 className="h6">Contratos por vencer</h2><ExpiringContractsTable rows={data?.expiring_contracts || []} /></Card.Body></Card></Col>
      </Row>
    </div>
  );
};

export default FinanceDashboard;
