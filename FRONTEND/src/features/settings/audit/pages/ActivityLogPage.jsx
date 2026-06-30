import { useEffect, useState } from "react";
import { Alert, Badge, Button, Form, Spinner, Table } from "react-bootstrap";
import { Navigate } from "react-router-dom";

import { fetchActivityLogs } from "../../../../api/activityLogs.js";
import { fetchUsers } from "../../../../api/users.js";
import { useAuth } from "../../../../contexts/AuthContext.jsx";

const ACTION_OPTIONS = [
  ["", "Todas"],
  ["create", "Create"],
  ["update", "Update"],
  ["delete", "Delete"],
  ["login", "Login"],
  ["logout", "Logout"],
  ["export", "Export"],
];

const actionBadgeClass = (action) => {
  const a = String(action || "").toLowerCase();
  if (a === "create") return "log-chip log-chip-create";
  if (a === "update") return "log-chip log-chip-update";
  if (a === "delete") return "log-chip log-chip-delete";
  if (a === "login") return "log-chip log-chip-login";
  if (a === "logout") return "log-chip log-chip-logout";
  return "log-chip log-chip-neutral";
};

const ActivityLogPage = () => {
  const { hasModuleAccess } = useAuth();
  const canView = hasModuleAccess("users", "view");

  const [logs, setLogs] = useState({ count: 0, results: [] });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [filters, setFilters] = useState({
    search: "",
    action: "",
    user: "",
    model_name: "",
    date_from: "",
    date_to: "",
  });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    const loadUsers = async () => {
      try {
        const data = await fetchUsers({ page_size: 200, is_active: true });
        if (!mounted) return;
        setUsers(data.results || []);
      } catch {
        if (!mounted) return;
        setUsers([]);
      }
    };
    void loadUsers();
    return () => {
      mounted = false;
    };
  }, [canView]);

  const loadLogs = async (targetPage = page) => {
    if (!canView) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchActivityLogs({
        ...filters,
        page: targetPage,
        page_size: 50,
      });
      setLogs(data);
      setPage(targetPage);
    } catch {
      setError("No se pudo cargar el log de actividades.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  if (!canView) {
    return <Navigate to="/" replace />;
  }

  const totalPages = Math.max(1, Math.ceil((logs.count || 0) / 50));

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Auditoría</div>
          <h1 className="h3 mb-1">Log de actividad</h1>
          <p className="text-muted mb-0">Audita acciones críticas de usuarios y cambios de información.</p>
        </div>
        <div className="app-action-cluster">
          <Button size="sm" variant="outline-secondary" onClick={() => void loadLogs(1)}>
            Recargar
          </Button>
        </div>
      </div>

      <section className="app-surface app-surface-padded mb-4">
        <div className="app-surface-header">
          <div>
            <div className="app-eyebrow">Filtros</div>
            <h2 className="h6 mb-0">Explorar actividad</h2>
          </div>
        </div>
        <Form
          className="row g-3 align-items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void loadLogs(1);
          }}
        >
          <div className="col-xl-3 col-lg-4">
            <Form.Label className="small mb-1">Buscar</Form.Label>
            <Form.Control
              value={filters.search}
              placeholder="Email, nombre, modelo o IP"
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            />
          </div>
          <div className="col-xl-2 col-lg-4">
            <Form.Label className="small mb-1">Acción</Form.Label>
            <Form.Select
              value={filters.action}
              onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}
            >
              {ACTION_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-xl-3 col-lg-4">
            <Form.Label className="small mb-1">Usuario</Form.Label>
            <Form.Select
              value={filters.user}
              onChange={(e) => setFilters((p) => ({ ...p, user: e.target.value }))}
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="col-xl-2 col-lg-3">
            <Form.Label className="small mb-1">Desde</Form.Label>
            <Form.Control
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((p) => ({ ...p, date_from: e.target.value }))}
            />
          </div>
          <div className="col-xl-2 col-lg-3">
            <Form.Label className="small mb-1">Hasta</Form.Label>
            <Form.Control
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((p) => ({ ...p, date_to: e.target.value }))}
            />
          </div>
          <div className="col-xl-2 col-lg-3">
            <Form.Label className="small mb-1">Modelo</Form.Label>
            <Form.Control
              value={filters.model_name}
              placeholder="Deal, User..."
              onChange={(e) => setFilters((p) => ({ ...p, model_name: e.target.value }))}
            />
          </div>
          <div className="col-xl-2 col-lg-3">
            <Button type="submit" size="sm" className="w-100">
              Filtrar
            </Button>
          </div>
        </Form>
      </section>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <section className="app-surface app-surface-padded">
        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
        ) : (
          <>
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Resultados</div>
                <h2 className="h6 mb-0">Actividad registrada</h2>
              </div>
              <Badge className="app-badge-soft">{logs.count || 0} registros</Badge>
            </div>
            <div className="app-table-shell mb-3">
              <Table responsive hover size="sm" className="mb-0 app-table-clean">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Modelo</th>
                    <th>Objeto</th>
                    <th>IP</th>
                    <th>Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {(logs.results || []).map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>{row.user_email || "-"}</td>
                      <td>
                        <Badge className={`text-uppercase ${actionBadgeClass(row.action)}`}>
                          {row.action}
                        </Badge>
                      </td>
                      <td>{row.model_name || "-"}</td>
                      <td className="small">{row.object_id || "-"}</td>
                      <td>{row.ip_address || "-"}</td>
                      <td className="small text-muted" style={{ maxWidth: 340 }}>
                        <code>{JSON.stringify(row.changes || {})}</code>
                      </td>
                    </tr>
                  ))}
                  {!logs.results?.length && (
                    <tr>
                      <td colSpan={7} className="text-muted text-center py-3">
                        Sin actividad registrada para esos filtros.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span className="small text-muted">
                Página {page} de {totalPages}
              </span>
              <div className="d-flex gap-2">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={page <= 1}
                  onClick={() => void loadLogs(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={page >= totalPages}
                  onClick={() => void loadLogs(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ActivityLogPage;
