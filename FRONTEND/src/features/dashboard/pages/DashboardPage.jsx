import { useEffect, useState } from "react";
import { Badge, Button, Card, Col, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchPlatformDashboard } from "../../../api/platform.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const DashboardPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlatformDashboard()
      .then(setStats)
      .catch(() => setError("No se pudieron cargar las métricas."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-page">
      <div className="app-page-header mb-4">
        <h1 className="h4 mb-1">Panel principal</h1>
        <p className="text-muted small mb-0">Resumen ejecutivo de actividad y operación</p>
      </div>
      {error && (
        <p className="text-danger small" role="alert">
          {error}
        </p>
      )}
      <Row className="g-3">
        <Col md={6}>
          <Card className="app-card h-100">
            <Card.Body>
              <Card.Title className="h6 mb-2">
                <i className="bi bi-person-circle me-2 text-primary" />
                Sesión
              </Card.Title>
              <p className="mb-0 text-muted small">
                Conectado como <strong>{user?.email}</strong>
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="app-card h-100">
            <Card.Body>
              <Card.Title className="h6 mb-2">
                <i className="bi bi-briefcase me-2 text-primary" />
                CRM
              </Card.Title>
              <p className="text-muted small mb-3">
                Contactos, pipeline de deals y dashboard de métricas.
              </p>
              <Button as={Link} to="/crm/contacts" variant="primary" size="sm">
                Ir a contactos
              </Button>
            </Card.Body>
          </Card>
        </Col>
        <Col md={12}>
          <Card className="app-card">
            <Card.Body>
              <Card.Title className="h6 mb-3">
                <i className="bi bi-speedometer2 me-2 text-primary" />
                Resumen de la plataforma
              </Card.Title>
              {loading ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" />
                </div>
              ) : stats ? (
                <Row className="g-2">
                  <Col xs={6} md={3}>
                    <div className="text-muted small">Contactos</div>
                    <div className="app-kpi">{stats.contacts_total}</div>
                  </Col>
                  <Col xs={6} md={3}>
                    <div className="text-muted small">Deals abiertos</div>
                    <div className="app-kpi">{stats.deals_open}</div>
                  </Col>
                  <Col xs={6} md={3}>
                    <div className="text-muted small">Conversaciones activas</div>
                    <div className="app-kpi">{stats.conversations_active}</div>
                  </Col>
                  <Col xs={6} md={3}>
                    <div className="text-muted small">Notificaciones sin leer</div>
                    <div className="app-kpi d-flex align-items-center gap-2">
                      {stats.notifications_unread}
                      {stats.notifications_unread > 0 && <Badge bg="warning" text="dark">Nuevo</Badge>}
                    </div>
                  </Col>
                </Row>
              ) : null}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
