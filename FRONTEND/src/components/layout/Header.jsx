import PropTypes from "prop-types";
import { Badge, Button, Container, Dropdown, Navbar, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext.jsx";
import { useI18n } from "../../contexts/I18nContext.jsx";
import { useNotifications } from "../../contexts/NotificationContext.jsx";
import { useTheme } from "../../contexts/ThemeContext.jsx";

const Header = ({ sidebarCollapsed, onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();

  return (
    <Navbar bg="body" expand="lg" className="app-header border-bottom">
      <Container fluid>
        <div className="d-flex align-items-center gap-2">
          <Button
            variant="outline-secondary"
            size="sm"
            type="button"
            aria-label="Toggle menu lateral"
            onClick={onToggleSidebar}
          >
            <i className={`bi ${sidebarCollapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar"}`} />
          </Button>
          <Navbar.Brand as={Link} to="/" className="fw-semibold mb-0">
            <i className="bi bi-grid-1x2-fill me-2 text-primary" />
            Valfora Holdings ERP
          </Navbar.Brand>
        </div>
        <div className="ms-auto d-flex align-items-center gap-3">
          <Button
            variant="outline-secondary"
            size="sm"
            type="button"
            onClick={() => toggleTheme()}
            aria-label={t("theme.toggle")}
            title={theme === "dark" ? t("theme.useLight") : t("theme.useDark")}
          >
            <i className={`bi ${theme === "dark" ? "bi-sun-fill" : "bi-moon-stars-fill"} me-1`} />
            {theme === "dark" ? "Claro" : "Oscuro"}
          </Button>
          {user && (
            <Dropdown align="end">
              <Dropdown.Toggle variant="outline-secondary" size="sm" id="notif-dropdown">
                <i className="bi bi-bell-fill me-1" />
                Notificaciones
                {unreadCount > 0 && (
                  <Badge bg="danger" className="ms-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Badge>
                )}
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow" style={{ minWidth: "320px", maxHeight: "360px" }}>
                <Dropdown.Header className="d-flex justify-content-between align-items-center">
                  <span>Centro de notificaciones</span>
                  {unreadCount > 0 && (
                    <Button variant="link" size="sm" className="p-0" onClick={() => markAllRead()}>
                      Marcar todas leídas
                    </Button>
                  )}
                </Dropdown.Header>
                {loading ? (
                  <div className="text-center py-3">
                    <Spinner animation="border" size="sm" />
                  </div>
                ) : items.length === 0 ? (
                  <Dropdown.ItemText className="text-muted small">No hay notificaciones.</Dropdown.ItemText>
                ) : (
                  items.slice(0, 15).map((n) => (
                    <Dropdown.Item
                      key={n.id}
                      as={n.action_url ? Link : "div"}
                      to={n.action_url || "#"}
                      className={n.is_read ? "" : "fw-semibold"}
                      onClick={() => {
                        if (!n.is_read) markRead(n.id);
                      }}
                    >
                      <div className="small text-truncate">{n.title}</div>
                      {n.message && (
                        <div className="text-muted small text-truncate" style={{ maxWidth: "280px" }}>
                          {n.message}
                        </div>
                      )}
                    </Dropdown.Item>
                  ))
                )}
              </Dropdown.Menu>
            </Dropdown>
          )}
          {user && (
            <span className="text-muted small">
              {user.first_name || user.email} · {user.role}
            </span>
          )}
          <Button variant="outline-secondary" size="sm" type="button" onClick={() => logout()}>
            <i className="bi bi-box-arrow-right me-1" />
            Salir
          </Button>
        </div>
      </Container>
    </Navbar>
  );
};

Header.propTypes = {
  sidebarCollapsed: PropTypes.bool.isRequired,
  onToggleSidebar: PropTypes.func.isRequired,
};

export default Header;
