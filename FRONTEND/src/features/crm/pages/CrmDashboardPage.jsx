import { useEffect, useState } from "react";
import { Card, Col, Row, Spinner, Table } from "react-bootstrap";

import { fetchCrmDashboard } from "../../../api/crm.js";
import { formatDealValue } from "../utils/formatters.js";

const CrmDashboardPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCrmDashboard()
      .then(setData)
      .catch(() => setError("No se pudo cargar el dashboard."))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="app-page">
      <div className="app-page-header mb-4">
        <h1 className="h4 mb-1">Dashboard CRM</h1>
        <p className="text-muted small mb-0">Rendimiento del pipeline y actividad reciente</p>
      </div>
      <Row className="g-3 mb-4">
        {Object.entries(stages).map(([stage, info]) => (
          <Col md={4} key={stage}>
            <Card className="app-card h-100">
              <Card.Body>
                <Card.Title className="h6 text-capitalize mb-2">{stage.replace("_", " ")}</Card.Title>
                <p className="mb-0 small text-muted">
                  {info.count} deals · Valor {formatDealValue(info.value)}
                </p>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <Card className="app-card">
        <Card.Body>
          <Card.Title className="h6 mb-3">
            <i className="bi bi-clock-history me-2 text-primary" />
            Actividad reciente
          </Card.Title>
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Asunto</th>
                <th>Tipo</th>
                <th>Contacto</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    Sin actividades aún.
                  </td>
                </tr>
              )}
              {recent.map((a) => (
                <tr key={a.id}>
                  <td>{a.subject}</td>
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
