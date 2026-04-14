import { useEffect, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import {
  bulkAssignContacts,
  bulkStageContacts,
  fetchContacts,
  fetchUsers,
} from "../../../api/crm.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";
import ContactDaysBadge from "../components/ContactDaysBadge.jsx";

const STAGES = [
  ["", "Todas las etapas"],
  ["new_lead", "Nuevo lead"],
  ["contacted", "Contactado"],
  ["qualified", "Calificado"],
  ["proposal", "Propuesta"],
  ["negotiation", "Negociación"],
  ["won", "Ganado"],
  ["lost", "Perdido"],
];

const ContactsListPage = () => {
  const { user } = useAuth();
  const [result, setResult] = useState({ results: [], count: 0 });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [users, setUsers] = useState([]);
  const [bulkAssign, setBulkAssign] = useState("");
  const [bulkStage, setBulkStage] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  const canManageUsers = user && ["admin", "super_admin"].includes(user.role);

  const load = () => {
    setLoading(true);
    const params = { page_size: 50 };
    if (search) params.search = search;
    if (stage) params.lifecycle_stage = stage;
    fetchContacts(params)
      .then((data) => setResult(data))
      .catch(() => setError("Error al cargar contactos."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (canManageUsers) {
      fetchUsers({ page_size: 100 })
        .then((d) => setUsers(d.results || []))
        .catch(() => {});
    }
  }, [canManageUsers]);

  const handleFilter = (e) => {
    e.preventDefault();
    load();
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    const rows = result.results || [];
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((c) => c.id)));
  };

  const runBulkAssign = async () => {
    if (!selected.size) return;
    setBulkWorking(true);
    setError("");
    try {
      const payload = { ids: [...selected] };
      if (canManageUsers) {
        payload.assigned_to = bulkAssign || null;
      } else if (user?.id) {
        payload.assigned_to = user.id;
      }
      await bulkAssignContacts(payload);
      setSelected(new Set());
      load();
    } catch {
      setError("No se pudo asignar.");
    } finally {
      setBulkWorking(false);
    }
  };

  const runBulkStage = async () => {
    if (!selected.size || !bulkStage) return;
    setBulkWorking(true);
    setError("");
    try {
      await bulkStageContacts({ ids: [...selected], lifecycle_stage: bulkStage });
      setSelected(new Set());
      setBulkStage("");
      load();
    } catch {
      setError("No se pudo actualizar la etapa.");
    } finally {
      setBulkWorking(false);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">Contactos</h1>
        <Button as={Link} to="/crm/contacts/new" variant="primary" size="sm">
          Nuevo contacto
        </Button>
      </div>
      <Form className="row g-2 mb-3" onSubmit={handleFilter}>
        <div className="col-md-4">
          <Form.Control
            placeholder="Buscar email o nombre"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <Form.Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map(([v, label]) => (
              <option key={v || "all"} value={v}>
                {label}
              </option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Button type="submit" variant="outline-secondary" size="sm">
            Filtrar
          </Button>
        </div>
      </Form>

      {!loading && result.results?.length > 0 && (
        <div className="d-flex flex-wrap align-items-end gap-2 mb-3 p-3 bg-body-secondary rounded border">
          <span className="small text-muted me-2">
            {selected.size} seleccionado(s)
          </span>
          {canManageUsers ? (
            <Form.Group className="mb-0">
              <Form.Label className="small mb-0">Asignar a</Form.Label>
              <Form.Select
                size="sm"
                value={bulkAssign}
                onChange={(e) => setBulkAssign(e.target.value)}
                style={{ minWidth: "200px" }}
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          ) : (
            <span className="small">Asignar selección a ti</span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline-primary"
            disabled={bulkWorking || !selected.size}
            onClick={() => void runBulkAssign()}
          >
            Aplicar asignación
          </Button>
          <Form.Group className="mb-0">
            <Form.Label className="small mb-0">Nueva etapa</Form.Label>
            <Form.Select
              size="sm"
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value)}
              style={{ minWidth: "160px" }}
            >
              <option value="">—</option>
              {STAGES.filter(([v]) => v).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            disabled={bulkWorking || !selected.size || !bulkStage}
            onClick={() => void runBulkStage()}
          >
            Cambiar etapa
          </Button>
        </div>
      )}

      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Table responsive hover size="sm" className="shadow-sm">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <Form.Check
                  aria-label="Seleccionar todos"
                  checked={
                    result.results?.length > 0 && selected.size === result.results.length
                  }
                  onChange={toggleAll}
                />
              </th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Fuente</th>
              <th>Etapa</th>
              <th>Urgencia</th>
            </tr>
          </thead>
          <tbody>
            {result.results?.map((c) => (
              <tr key={c.id}>
                <td>
                  <Form.Check
                    aria-label={`Seleccionar ${c.email}`}
                    checked={selected.has(c.id)}
                    onChange={() => toggleRow(c.id)}
                  />
                </td>
                <td>
                  <Link to={`/crm/contacts/${c.id}`}>
                    {c.first_name} {c.last_name}
                  </Link>
                </td>
                <td>{c.email}</td>
                <td className="text-capitalize">{(c.source || "other").replace("_", " ")}</td>
                <td className="text-capitalize">{c.lifecycle_stage?.replace("_", " ")}</td>
                <td>
                  <ContactDaysBadge days={c.days_since_last_contact} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {!loading && (
        <p className="text-muted small">
          Total: {result.count ?? result.results?.length ?? 0} contactos
        </p>
      )}
    </div>
  );
};

export default ContactsListPage;
