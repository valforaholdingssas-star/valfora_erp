import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table } from "react-bootstrap";
import { Navigate } from "react-router-dom";

import {
  createUser,
  fetchPermissionMatrix,
  fetchUsers,
  updatePermissionMatrix,
  updateUser,
} from "../../../api/users.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const ROLE_OPTIONS = [
  ["super_admin", "Super Admin"],
  ["admin", "Admin"],
  ["collaborator", "Collaborator"],
];

const defaultForm = {
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  phone_number: "",
  role: "collaborator",
  is_active: true,
};

const UsersManagementPage = () => {
  const { user, hasModuleAccess, loadProfile } = useAuth();
  const canManage = hasModuleAccess("users", "view");
  const canEditUsers = hasModuleAccess("users", "edit");
  const canGrantSuperAdmin = user?.role === "super_admin";

  const [result, setResult] = useState({ count: 0, results: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const [matrixData, setMatrixData] = useState({ roles: [], modules: [], matrix: {} });
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixError, setMatrixError] = useState("");

  const roleOptions = useMemo(() => {
    if (canGrantSuperAdmin) return ROLE_OPTIONS;
    return ROLE_OPTIONS.filter(([value]) => value !== "super_admin");
  }, [canGrantSuperAdmin]);

  const loadUsers = async () => {
    if (!canManage) return;
    setLoading(true);
    setError("");
    try {
      const params = { page_size: 100 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.is_active = statusFilter;
      const data = await fetchUsers(params);
      setResult(data);
    } catch {
      setError("No se pudo cargar la lista de usuarios.");
    } finally {
      setLoading(false);
    }
  };

  const loadMatrix = async () => {
    if (!canManage) return;
    setMatrixLoading(true);
    setMatrixError("");
    try {
      const data = await fetchPermissionMatrix();
      setMatrixData({
        roles: data.roles || [],
        modules: data.modules || [],
        matrix: data.matrix || {},
      });
    } catch {
      setMatrixError("No se pudo cargar la matriz de permisos.");
    } finally {
      setMatrixLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    void loadMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  if (!canManage) {
    return <Navigate to="/" replace />;
  }

  const openCreate = () => {
    setEditingUser(null);
    setForm(defaultForm);
    setShowModal(true);
  };

  const openEdit = (target) => {
    setEditingUser(target);
    setForm({
      email: target.email || "",
      password: "",
      first_name: target.first_name || "",
      last_name: target.last_name || "",
      phone_number: target.phone_number || "",
      role: target.role || "collaborator",
      is_active: Boolean(target.is_active),
    });
    setShowModal(true);
  };

  const onClose = () => {
    setShowModal(false);
    setSaving(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canEditUsers) return;
    setSaving(true);
    setError("");
    try {
      if (editingUser) {
        const payload = {
          email: form.email.trim(),
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone_number: form.phone_number.trim(),
          role: form.role,
          is_active: form.is_active,
        };
        await updateUser(editingUser.id, payload);
      } else {
        await createUser({
          email: form.email.trim(),
          password: form.password,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          phone_number: form.phone_number.trim(),
          role: form.role,
        });
      }
      onClose();
      await loadUsers();
      await loadProfile();
    } catch {
      setError(editingUser ? "No se pudo actualizar el usuario." : "No se pudo crear el usuario.");
      setSaving(false);
    }
  };

  const toggleActive = async (target) => {
    if (!canEditUsers) return;
    setError("");
    try {
      await updateUser(target.id, { is_active: !target.is_active });
      await loadUsers();
    } catch {
      setError("No se pudo actualizar el estado del usuario.");
    }
  };

  const toggleMatrixCell = (roleCode, moduleCode, action, checked) => {
    setMatrixData((prev) => ({
      ...prev,
      matrix: {
        ...prev.matrix,
        [roleCode]: {
          ...(prev.matrix?.[roleCode] || {}),
          [moduleCode]: {
            ...(prev.matrix?.[roleCode]?.[moduleCode] || {}),
            [action]: checked,
          },
        },
      },
    }));
  };

  const saveMatrix = async () => {
    if (!canEditUsers) return;
    setMatrixSaving(true);
    setMatrixError("");
    try {
      const updated = await updatePermissionMatrix({ matrix: matrixData.matrix });
      setMatrixData({
        roles: updated.roles || [],
        modules: updated.modules || [],
        matrix: updated.matrix || {},
      });
      await loadProfile();
    } catch {
      setMatrixError("No se pudo guardar la matriz de permisos.");
    } finally {
      setMatrixSaving(false);
    }
  };

  const roleLabel = (roleCode) =>
    matrixData.roles.find((r) => r.role === roleCode)?.label || roleCode.replace("_", " ");

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">Usuarios y permisos</h1>
        <Button size="sm" onClick={openCreate} disabled={!canEditUsers}>
          Nuevo usuario
        </Button>
      </div>

      <Form
        className="row g-2 align-items-end mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void loadUsers();
        }}
      >
        <div className="col-md-4">
          <Form.Label className="small mb-1">Buscar</Form.Label>
          <Form.Control
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Email, nombre o apellido"
          />
        </div>
        <div className="col-md-3">
          <Form.Label className="small mb-1">Rol</Form.Label>
          <Form.Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">Todos</option>
            {roleOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-3">
          <Form.Label className="small mb-1">Estado</Form.Label>
          <Form.Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Button type="submit" variant="outline-secondary" size="sm" className="w-100">
            Filtrar
          </Button>
        </div>
      </Form>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <Spinner animation="border" />
      ) : (
        <>
          <Table responsive hover size="sm" className="shadow-sm">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th style={{ width: 220 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(result.results || []).map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{`${u.first_name || ""} ${u.last_name || ""}`.trim() || "-"}</td>
                  <td className="text-capitalize">{u.role?.replace("_", " ") || "-"}</td>
                  <td>
                    <Badge bg={u.is_active ? "success" : "secondary"}>
                      {u.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </td>
                  <td className="d-flex gap-2">
                    <Button size="sm" variant="outline-primary" onClick={() => openEdit(u)} disabled={!canEditUsers}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_active ? "outline-warning" : "outline-success"}
                      onClick={() => void toggleActive(u)}
                      disabled={!canEditUsers}
                    >
                      {u.is_active ? "Desactivar" : "Activar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="text-muted small mb-4">
            Total: {result.count ?? result.results?.length ?? 0} usuarios
          </p>
        </>
      )}

      <Card className="app-card">
        <Card.Header className="d-flex justify-content-between align-items-center">
          <strong>Permisos por rol (módulos)</strong>
          <Button size="sm" onClick={() => void saveMatrix()} disabled={matrixSaving || matrixLoading || !canEditUsers}>
            {matrixSaving ? "Guardando..." : "Guardar permisos"}
          </Button>
        </Card.Header>
        <Card.Body>
          {matrixError && <Alert variant="danger" className="mb-3">{matrixError}</Alert>}
          {matrixLoading ? (
            <Spinner animation="border" />
          ) : (
            <Table responsive bordered size="sm" className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Módulo</th>
                  {matrixData.roles.map((role) => (
                    <th key={role.role} className="text-center">{role.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.modules.map((module) => (
                  <tr key={module.module}>
                    <td className="fw-semibold">{module.label}</td>
                    {matrixData.roles.map((role) => {
                      const lockedRole = role.role === "super_admin" && !canGrantSuperAdmin;
                      const cell = matrixData.matrix?.[role.role]?.[module.module] || { view: false, edit: false };
                      return (
                        <td key={`${module.module}-${role.role}`}>
                          <div className="d-flex justify-content-center gap-3">
                            <Form.Check
                              type="switch"
                              id={`view-${role.role}-${module.module}`}
                              label="Ver"
                              checked={Boolean(cell.view)}
                              disabled={!canEditUsers || lockedRole}
                              onChange={(e) =>
                                toggleMatrixCell(role.role, module.module, "view", e.target.checked)
                              }
                            />
                            <Form.Check
                              type="switch"
                              id={`edit-${role.role}-${module.module}`}
                              label="Editar"
                              checked={Boolean(cell.edit)}
                              disabled={!canEditUsers || lockedRole}
                              onChange={(e) =>
                                toggleMatrixCell(role.role, module.module, "edit", e.target.checked)
                              }
                            />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="text-muted small mb-0 mt-3">
            Cambios aplican a visualización y edición por módulo. Rol actual:{" "}
            <strong className="text-capitalize">{roleLabel(user?.role || "collaborator")}</strong>.
          </p>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={onClose} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>{editingUser ? "Editar usuario" : "Nuevo usuario"}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="d-grid gap-3">
            <Form.Group>
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
            </Form.Group>

            {!editingUser && (
              <Form.Group>
                <Form.Label>Contraseña temporal</Form.Label>
                <Form.Control
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  required
                />
              </Form.Group>
            )}

            <Form.Group>
              <Form.Label>Nombres</Form.Label>
              <Form.Control
                value={form.first_name}
                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
              />
            </Form.Group>

            <Form.Group>
              <Form.Label>Apellidos</Form.Label>
              <Form.Control
                value={form.last_name}
                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
              />
            </Form.Group>

            <Form.Group>
              <Form.Label>Teléfono</Form.Label>
              <Form.Control
                value={form.phone_number}
                onChange={(e) => setForm((prev) => ({ ...prev, phone_number: e.target.value }))}
              />
            </Form.Group>

            <Form.Group>
              <Form.Label>Rol</Form.Label>
              <Form.Select
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                {roleOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            {editingUser && (
              <Form.Check
                type="switch"
                id="edit-user-active"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                label="Usuario activo"
              />
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !canEditUsers}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default UsersManagementPage;

