import { useEffect, useState } from "react";
import { Badge, Button, Col, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchPlatformDashboard } from "../../../api/platform.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const DashboardPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const quickLinks = [
    {
      title: "CRM",
      description: "Contactos, pipeline y operación comercial.",
      icon: "bi-briefcase",
      to: "/crm/dashboard",
      action: "Abrir CRM",
    },
    {
      title: "Chat",
      description: "Conversaciones, SLA y seguimiento comercial.",
      icon: "bi-chat-square-text",
      to: "/chat",
      action: "Ir al chat",
    },
    {
      title: "Finanzas",
      description: "Facturación, recaudo y contratos activos.",
      icon: "bi-cash-coin",
      to: "/finance/dashboard",
      action: "Ver finanzas",
    },
    {
      title: "Wiki",
      description: "Documentación operativa y conocimiento interno.",
      icon: "bi-journal-richtext",
      to: "/wiki",
      action: "Abrir wiki",
    },
    {
      title: "IA",
      description: "Agentes, runtime y contexto RAG por módulo.",
      icon: "bi-cpu",
      to: "/settings/ai",
      action: "Configurar IA",
    },
  ];

  useEffect(() => {
    fetchPlatformDashboard()
      .then(setStats)
      .catch(() => setError("No se pudieron cargar las métricas."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div className="app-hero-copy">
          <div className="app-eyebrow">Visión general</div>
          <h1 className="h3 mb-2">Panel principal</h1>
          <p className="text-muted mb-0">Resumen ejecutivo de actividad, operación y accesos de trabajo frecuentes.</p>
        </div>
        <div className="app-hero-meta">
          <div className="app-inline-stat">
            <span className="app-inline-stat-label">Usuario activo</span>
            <strong>{user?.email || "Sin sesión"}</strong>
          </div>
          <div className="app-action-cluster">
            <Button as={Link} to="/chat" variant="primary">
              Abrir chat
            </Button>
            <Button as={Link} to="/crm/pipeline" variant="outline-secondary">
              Pipeline
            </Button>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-danger small" role="alert">
          {error}
        </p>
      )}
      <div className="app-kpi-grid mb-4">
        {loading ? (
          <div className="app-surface app-surface-centered">
            <Spinner animation="border" size="sm" />
          </div>
        ) : stats ? (
          <>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Contactos</span>
              <strong className="app-kpi-value">{stats.contacts_total}</strong>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Deals abiertos</span>
              <strong className="app-kpi-value">{stats.deals_open}</strong>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Conversaciones activas</span>
              <strong className="app-kpi-value">{stats.conversations_active}</strong>
            </div>
            <div className="app-kpi-tile">
              <span className="app-kpi-label">Notificaciones</span>
              <div className="d-flex align-items-center gap-2">
                <strong className="app-kpi-value">{stats.notifications_unread}</strong>
                {stats.notifications_unread > 0 && (
                  <Badge className="app-badge-soft-warning">Nuevo</Badge>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
      <Row className="g-4">
        <Col xl={8}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Acceso rápido</div>
                <h2 className="h5 mb-1">Módulos clave</h2>
                <p className="text-muted mb-0">Entradas directas a las áreas que más mueven la operación.</p>
              </div>
            </div>
            <div className="app-feature-grid">
              {quickLinks.map((item) => (
                <Link key={item.to} to={item.to} className="app-feature-card">
                  <div className="app-feature-icon">
                    <i className={`bi ${item.icon}`} />
                  </div>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <span>{item.action}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </Col>
        <Col xl={4}>
          <section className="app-surface app-surface-padded h-100">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Sesión</div>
                <h2 className="h5 mb-1">Estado actual</h2>
                <p className="text-muted mb-0">Información operativa inmediata del usuario conectado.</p>
              </div>
            </div>
            <div className="app-detail-stack">
              <div className="app-detail-row">
                <span>Correo</span>
                <strong>{user?.email || "-"}</strong>
              </div>
              <div className="app-detail-row">
                <span>Rol</span>
                <strong>{user?.role || "-"}</strong>
              </div>
              <div className="app-detail-row">
                <span>Atajo recomendado</span>
                <strong>Continuar conversaciones</strong>
              </div>
            </div>
          </section>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
