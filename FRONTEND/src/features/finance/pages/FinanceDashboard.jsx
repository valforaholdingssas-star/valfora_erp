import { useEffect, useState } from "react";
import { Col, Form, Row, Spinner } from "react-bootstrap";

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
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Dashboard financiero</h1>
          <p className="text-muted mb-0">Indicadores de facturación, recaudo y riesgo de cartera.</p>
        </div>
        <div className="app-filterbar">
          <div className="app-filter-field">
            <span>Periodo</span>
            <Form.Select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              <option value="month">Mes</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Año</option>
            </Form.Select>
          </div>
        </div>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {data?.kpis && (
        <div className="app-kpi-grid mb-4">
          <div className="app-kpi-tile"><span className="app-kpi-label">Facturado</span><strong className="app-kpi-value">{data.kpis.invoiced_total}</strong></div>
          <div className="app-kpi-tile"><span className="app-kpi-label">Cobrado</span><strong className="app-kpi-value">{data.kpis.paid_total}</strong></div>
          <div className="app-kpi-tile"><span className="app-kpi-label">Cartera</span><strong className="app-kpi-value">{data.kpis.receivables_total}</strong></div>
          <div className="app-kpi-tile"><span className="app-kpi-label">Vencida</span><strong className="app-kpi-value">{data.kpis.overdue_total}</strong></div>
          <div className="app-kpi-tile"><span className="app-kpi-label">Tasa cobro</span><strong className="app-kpi-value">{(data.kpis.collection_rate || 0).toFixed(2)}%</strong></div>
          <div className="app-kpi-tile"><span className="app-kpi-label">Contratos activos</span><strong className="app-kpi-value">{data.kpis.active_contracts}</strong></div>
        </div>
      )}

      <Row className="g-3">
        <Col lg={6}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Ingresos mensuales</h2></div>
            <RevenueChart rows={data?.monthly_income || []} />
          </section>
        </Col>
        <Col lg={6}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Aging de cartera</h2></div>
            <AgingChart aging={data?.aging} />
          </section>
        </Col>
        <Col lg={6}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Top clientes</h2></div>
            <TopClientsChart rows={data?.top_clients || []} />
          </section>
        </Col>
        <Col lg={6}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header"><h2 className="h6 mb-0">Facturado vs cobrado</h2></div>
            <CollectionRateChart invoiced={data?.billing_vs_collection?.invoiced || 0} collected={data?.billing_vs_collection?.collected || 0} />
          </section>
        </Col>
        <Col lg={12}>
          <section className="app-surface app-surface-padded">
            <div className="app-surface-header"><h2 className="h6 mb-0">Contratos por vencer</h2></div>
            <ExpiringContractsTable rows={data?.expiring_contracts || []} />
          </section>
        </Col>
      </Row>
    </div>
  );
};

export default FinanceDashboard;
