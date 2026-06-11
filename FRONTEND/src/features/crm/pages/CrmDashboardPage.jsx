import { useEffect, useState } from "react";
import { Badge, Card, Col, Form, Row, Spinner, Table } from "react-bootstrap";

import { fetchCompanies, fetchCrmDashboard } from "../../../api/crm.js";
import { formatDealValue } from "../utils/formatters.js";

const CrmDashboardPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState({ results: [] });
  const [companyFilter, setCompanyFilter] = useState("");

  useEffect(() => {
    fetchCompanies({ page_size: 200 }).then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCrmDashboard(companyFilter ? { company: companyFilter } : undefined)
      .then(setData)
      .catch(() => setError("No se pudo cargar el dashboard."))
      .finally(() => setLoading(false));
  }, [companyFilter]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" />
      </div>
    );
  }
  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  const stages = data.pipeline_by_stage || {};
  const recent = data.recent_activities || [];
  const summary = data.summary || {};

  return (
    <div className="app-page">
      <div className="app-page-header mb-4 app-page-headline">
        <h1 className="h4 mb-1">Dashboard CRM</h1>
        <p className="text-muted mb-0">Rendimiento del pipeline y actividad reciente</p>
      </div>
      <div className="app-section-card p-2 mb-3 d-flex align-items-center gap-2">
        <span className="small text-muted">Empresa:</span>
        <Form.Select
          size="sm"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          style={{ maxWidth: 360 }}
        >
          <option value="">Todas</option>
          {(companies.results || []).map((co) => (
            <option key={co.id} value={co.id}>{co.name}</option>
          ))}
        </Form.Select>
      </div>
      <Row className="g-3 mb-4">
        <Col md={3}>
          <Card className="app-card h-100 app-kpi-card">
            <Card.Body>
              <p className="text-uppercase app-kpi-label mb-1">Pipeline consolidado</p>
              <div className="app-kpi mb-1">{summary.active_count || 0} deals</div>
              <p className="mb-0 text-muted">Valor {formatDealValue(summary.active_value)}</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="app-card h-100 app-kpi-card">
            <Card.Body>
              <p className="text-uppercase app-kpi-label mb-1">Total negocios</p>
              <div className="app-kpi mb-1">{summary.total_count || 0}</div>
              <p className="mb-0 text-muted">Incluye abiertos y cerrados</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="app-card h-100 app-kpi-card">
            <Card.Body>
              <p className="text-uppercase app-kpi-label mb-1">Ganados</p>
              <div className="app-kpi mb-1">{summary.won_count || 0}</div>
              <p className="mb-0 text-muted">Deals convertidos</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="app-card h-100 app-kpi-card">
            <Card.Body>
              <p className="text-uppercase app-kpi-label mb-1">Perdidos</p>
              <div className="app-kpi mb-1">{summary.lost_count || 0}</div>
              <p className="mb-0 text-muted">Deals cerrados sin conversión</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row className="g-3 mb-4">
        {Object.entries(stages).map(([stage, info]) => (
          <Col md={4} key={stage}>
            <Card className="app-card h-100 app-kpi-card">
              <Card.Body>
                <p className="text-uppercase app-kpi-label mb-1">{stage.replace("_", " ")}</p>
                <div className="app-kpi mb-1">{info.count} deals</div>
                <p className="mb-0 text-muted">Valor {formatDealValue(info.value)}</p>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      {!companyFilter && (
        <Card className="app-card app-section-card mb-4">
          <Card.Body>
            <Card.Title className="h6 mb-3">Deals por empresa</Card.Title>
            <Table responsive hover size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Deals</th>
                  <th>Valor</th>
                  <th>Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {(data.by_company || []).map((row) => (
                  <tr key={row.company_id || "none"}>
                    <td>{row.company_name}</td>
                    <td>{row.count}</td>
                    <td>{formatDealValue(row.value)}</td>
                    <td>
                      <div className="d-flex flex-wrap gap-1">
                        {Object.entries(row.pipeline_by_stage || {}).map(([stage, stageInfo]) => (
                          <Badge key={`${row.company_id || "none"}-${stage}`} bg="light" text="dark" className="border">
                            {stage.replace("_", " ")}: {stageInfo.count}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
      <Card className="app-card app-section-card">
        <Card.Body>
          <Card.Title className="h6 mb-3">
            <i className="bi bi-clock-history me-2 text-primary" />
            Actividad reciente
          </Card.Title>
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Asunto</th>
                <th>Deal</th>
                <th>Empresa</th>
                <th>Tipo</th>
                <th>Contacto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted">
                    Sin actividades aún.
                  </td>
                </tr>
              )}
              {recent.map((a) => (
                <tr key={a.id}>
                  <td>{a.subject}</td>
                  <td>{a.deal_title || "—"}</td>
                  <td>{a.company_name || "—"}</td>
                  <td>{a.activity_type}</td>
                  <td>{a.contact_name}</td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </div>
  );
};

export default CrmDashboardPage;
