import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Form, Spinner, Table } from "react-bootstrap";
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
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Log de actividad</h1>
        <Button size="sm" variant="outline-secondary" onClick={() => void loadLogs(1)}>
          Recargar
        </Button>
      </div>

      <Card className="app-card mb-3">
        <Card.Body>
          <Form
            className="row g-2 align-items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void loadLogs(1);
            }}
          >
            <div className="col-lg-3">
              <Form.Label className="small mb-1">Buscar</Form.Label>
              <Form.Control
                value={filters.search}
                placeholder="Email, nombre, modelo o IP"
                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              />
            </div>
            <div className="col-lg-2">
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
            <div className="col-lg-3">
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
            <div className="col-lg-2">
              <Form.Label className="small mb-1">Desde</Form.Label>
              <Form.Control
                type="date"
                value={filters.date_from}
                onChange={(e) => setFilters((p) => ({ ...p, date_from: e.target.value }))}
              />
            </div>
            <div className="col-lg-2">
              <Form.Label className="small mb-1">Hasta</Form.Label>
              <Form.Control
                type="date"
                value={filters.date_to}
                onChange={(e) => setFilters((p) => ({ ...p, date_to: e.target.value }))}
              />
            </div>
            <div className="col-lg-2">
              <Form.Label className="small mb-1">Modelo</Form.Label>
              <Form.Control
                value={filters.model_name}
                placeholder="Deal, User..."
                onChange={(e) => setFilters((p) => ({ ...p, model_name: e.target.value }))}
              />
            </div>
            <div className="col-lg-2">
              <Button type="submit" size="sm" className="w-100">
                Filtrar
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <Card className="app-card">
        <Card.Body>
          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <>
              <Table responsive hover size="sm" className="mb-3">
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
                        <Badge bg="secondary" className="text-uppercase">
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

              <div className="d-flex justify-content-between align-items-center">
                <span className="small text-muted">
                  Total: {logs.count || 0} registros
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
                  <span className="small align-self-center">
                    Página {page} de {totalPages}
                  </span>
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
        </Card.Body>
      </Card>
    </div>
  );
};

export default ActivityLogPage;
