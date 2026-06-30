import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import {
  bulkAssignContacts,
  bulkStageContacts,
  fetchContacts,
  fetchUsers,
} from "../../../api/crm.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";

const STAGES = [
  ["", "Todas las etapas"],
  ["new_lead", "Nuevo lead"],
  ["contacted", "Contactado"],
  ["qualified", "Calificado"],
  ["proposal", "Propuesta"],
  ["negotiation", "Negociacion"],
  ["won", "Ganado"],
  ["lost", "Perdido"],
];

const SOURCES = [
  ["", "Todas las fuentes"],
  ["other", "Other"],
  ["website", "Website"],
  ["whatsapp", "WhatsApp"],
  ["linkedin", "LinkedIn"],
  ["referral", "Referral"],
  ["social_media", "Social media"],
];

const stageBadgeClass = (stageValue) => {
  const s = String(stageValue || "").toLowerCase();
  if (s === "new_lead") return "stage-chip stage-chip-new";
  if (s === "contacted") return "stage-chip stage-chip-contacted";
  if (s === "qualified") return "stage-chip stage-chip-qualified";
  if (s === "proposal") return "stage-chip stage-chip-proposal";
  if (s === "negotiation") return "stage-chip stage-chip-negotiation";
  if (s === "won") return "stage-chip stage-chip-won";
  if (s === "lost") return "stage-chip stage-chip-lost";
  return "stage-chip stage-chip-neutral";
};

const formatSource = (value) => {
  const text = String(value || "other").replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const getInitials = (firstName, lastName) =>
  `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "CT";

const getUrgencyMeta = (days) => {
  if (days === null || days === undefined) {
    return {
      key: "none",
      label: "Sin contacto",
      className: "crm-urgency-chip crm-urgency-chip-neutral",
      icon: "bi-clock",
    };
  }
  if (days >= 8) {
    return {
      key: "high",
      label: `${days}d sin contacto`,
      className: "crm-urgency-chip crm-urgency-chip-high",
      icon: "bi-exclamation-triangle",
    };
  }
  if (days >= 3) {
    return {
      key: "medium",
      label: `${days}d sin contacto`,
      className: "crm-urgency-chip crm-urgency-chip-medium",
      icon: "bi-hourglass-split",
    };
  }
  return {
    key: "low",
    label: "Al dia",
    className: "crm-urgency-chip crm-urgency-chip-low",
    icon: "bi-check-circle",
  };
};

const ContactsListPage = () => {
  const { user } = useAuth();
  const [result, setResult] = useState({ results: [], count: 0 });
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [urgency, setUrgency] = useState("");
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
    setError("");
    const params = { page_size: 50 };
    if (search) params.search = search;
    if (stage) params.lifecycle_stage = stage;
    if (source) params.source = source;
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
        .then((data) => setUsers(data.results || []))
        .catch(() => {});
    }
  }, [canManageUsers]);

  const displayedContacts = useMemo(() => {
    const contacts = result.results || [];
    if (!urgency) return contacts;
    return contacts.filter((contact) => getUrgencyMeta(contact.days_since_last_contact).key === urgency);
  }, [result.results, urgency]);

  const handleFilter = (e) => {
    e.preventDefault();
    load();
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === displayedContacts.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(displayedContacts.map((contact) => contact.id)));
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
    <div className="crm-page-shell">
      <section className="crm-page-header">
        <div>
          <div className="crm-breadcrumb">
            <span>CRM</span>
            <i className="bi bi-chevron-right" />
            <span>Contactos</span>
          </div>
          <h1>Contactos</h1>
          <p>Gestiona pipeline comercial, responsables y seguimiento por urgencia.</p>
        </div>
        <div className="crm-page-actions">
          <Button variant="light" className="crm-secondary-button">
            <i className="bi bi-download" /> Exportar
          </Button>
          <Button as={Link} to="/crm/contacts/new" variant="primary">
            + Nuevo contacto
          </Button>
        </div>
      </section>

      <Form className="crm-filter-bar crm-filter-bar-contacts" onSubmit={handleFilter}>
        <div className="crm-filter-search">
          <i className="bi bi-search" />
          <Form.Control
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre o email..."
          />
        </div>
        <Form.Select value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGES.map(([value, label]) => (
            <option key={value || "all"} value={value}>
              {label}
            </option>
          ))}
        </Form.Select>
        <Form.Select value={source} onChange={(e) => setSource(e.target.value)}>
          {SOURCES.map(([value, label]) => (
            <option key={value || "all"} value={value}>
              {label}
            </option>
          ))}
        </Form.Select>
        <Form.Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="">Toda urgencia</option>
          <option value="low">Al dia</option>
          <option value="medium">Media</option>
          <option value="high">Alta</option>
          <option value="none">Sin contacto</option>
        </Form.Select>
        <Button type="submit" variant="dark" className="crm-dark-button">
          <i className="bi bi-sliders" /> Filtrar
        </Button>
        <div className="crm-filter-total">
          <span>{displayedContacts.length}</span> contactos
        </div>
      </Form>

      {!loading && displayedContacts.length > 0 ? (
        <section className="crm-bulk-bar">
          <div className="crm-bulk-count">
            <Form.Check
              checked={displayedContacts.length > 0 && selected.size === displayedContacts.length}
              onChange={toggleAll}
            />
            <span>
              <strong>{selected.size}</strong> seleccionados
            </span>
          </div>

          <div className="crm-bulk-separator" />

          <div className="crm-bulk-group">
            <span>Asignar a</span>
            {canManageUsers ? (
              <Form.Select size="sm" value={bulkAssign} onChange={(e) => setBulkAssign(e.target.value)}>
                <option value="">Sin asignar</option>
                {users.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.full_name || option.email || option.username}
                  </option>
                ))}
              </Form.Select>
            ) : (
              <div className="crm-bulk-pill">Asignar a ti</div>
            )}
            <Button variant="outline-primary" size="sm" disabled={bulkWorking || !selected.size} onClick={() => void runBulkAssign()}>
              Aplicar
            </Button>
          </div>

          <div className="crm-bulk-separator" />

          <div className="crm-bulk-group">
            <span>Nueva etapa</span>
            <Form.Select size="sm" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)}>
              <option value="">—</option>
              {STAGES.filter(([value]) => value).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Form.Select>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={bulkWorking || !selected.size || !bulkStage}
              onClick={() => void runBulkStage()}
            >
              Cambiar etapa
            </Button>
          </div>
        </section>
      ) : null}

      {error ? <div className="crm-empty-state text-danger">{error}</div> : null}

      {loading ? (
        <div className="crm-empty-state">
          <Spinner animation="border" />
        </div>
      ) : (
        <section className="crm-table-panel">
          <div className="crm-data-table-wrap">
            <Table responsive className="crm-data-table crm-contacts-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>
                    <Form.Check
                      checked={displayedContacts.length > 0 && selected.size === displayedContacts.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Fuente</th>
                  <th>Etapa</th>
                  <th>Urgencia</th>
                  <th className="text-end">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayedContacts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      No hay contactos con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  displayedContacts.map((contact) => {
                    const urgencyMeta = getUrgencyMeta(contact.days_since_last_contact);
                    return (
                      <tr key={contact.id} className={selected.has(contact.id) ? "crm-selected-row" : ""}>
                        <td>
                          <Form.Check checked={selected.has(contact.id)} onChange={() => toggleRow(contact.id)} />
                        </td>
                        <td>
                          <div className="crm-contact-cell">
                            <span className="crm-contact-avatar">{getInitials(contact.first_name, contact.last_name)}</span>
                            <div>
                              <Link to={`/crm/contacts/${contact.id}`} className="crm-row-title">
                                {contact.first_name} {contact.last_name}
                              </Link>
                              <small>{contact.company_name || "—"}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="crm-mono-text">{contact.email || "—"}</span>
                        </td>
                        <td>{formatSource(contact.source)}</td>
                        <td>
                          <span className={`${stageBadgeClass(contact.lifecycle_stage)} text-capitalize`}>
                            {String(contact.lifecycle_stage || "sin etapa").replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>
                          <span className={urgencyMeta.className}>
                            <i className={`bi ${urgencyMeta.icon}`} />
                            {urgencyMeta.label}
                          </span>
                        </td>
                        <td className="text-end">
                          <div className="crm-row-actions">
                            <Button as={Link} to={`/crm/contacts/${contact.id}`} variant="light" className="crm-icon-button">
                              <i className="bi bi-eye" />
                            </Button>
                            <Button as={Link} to={`/crm/contacts/${contact.id}/edit`} variant="light" className="crm-icon-button">
                              <i className="bi bi-pencil" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
};

export default ContactsListPage;
