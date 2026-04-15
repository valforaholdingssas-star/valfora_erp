import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Badge, Button, Dropdown, Form, Spinner } from "react-bootstrap";

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "C";

const ChatSidebar = ({
  loading,
  conversations,
  activeId,
  onSelect,
  query,
  onQueryChange,
  channelFilter,
  onChannelFilterChange,
  filters,
  onApplyFilters,
  onClearFilters,
  responsibleOptions,
}) => {
  const [draftFilters, setDraftFilters] = useState(filters);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  const activeFilters = useMemo(
    () => [filters.dealStage, filters.dealOpenedFrom, filters.dealOpenedTo, filters.responsible].filter(Boolean).length,
    [filters],
  );

  const activeFilterBadges = useMemo(() => {
    const badges = [];
    if (filters.dealStage) badges.push({ key: "dealStage", label: `Etapa: ${filters.dealStage}` });
    if (filters.dealOpenedFrom) badges.push({ key: "dealOpenedFrom", label: `Desde: ${filters.dealOpenedFrom}` });
    if (filters.dealOpenedTo) badges.push({ key: "dealOpenedTo", label: `Hasta: ${filters.dealOpenedTo}` });
    if (filters.responsible) {
      const user = responsibleOptions.find((u) => String(u.id) === String(filters.responsible));
      badges.push({
        key: "responsible",
        label: `Responsable: ${[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Asignado"}`,
      });
    }
    return badges;
  }, [filters, responsibleOptions]);

  const removeSingleFilter = (filterKey) => {
    const next = { ...filters, [filterKey]: "" };
    onApplyFilters(next);
  };

  return (
    <div className="p-2 h-100 app-chat-sidebar">
      <div className="app-chat-sidebar-head">
        <div className="d-flex justify-content-between align-items-center px-2 mb-2">
          <h2 className="h6 mb-0">Chat</h2>
          <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Nueva conversación">
            <i className="bi bi-plus-lg" />
          </button>
        </div>
        <Form.Control
          size="sm"
          placeholder="Buscar chats"
          className="mb-2"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="d-flex gap-2 mb-2">
          <Button
            size="sm"
            variant={channelFilter === "whatsapp" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("whatsapp")}
          >
            WhatsApp
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "internal" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("internal")}
          >
            Interno
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("")}
          >
            Todos
          </Button>
        </div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <Dropdown align="end" className="app-chat-filter-dropdown">
            <Dropdown.Toggle size="sm" variant="outline-secondary" id="chat-filters-toggle" className="d-flex align-items-center gap-2">
              <i className="bi bi-funnel" />
              Filtros
              {activeFilters > 0 && <Badge bg="primary">{activeFilters}</Badge>}
            </Dropdown.Toggle>
            <Dropdown.Menu className="p-3 app-chat-filters-menu">
          <Form.Group className="mb-2">
            <Form.Label className="small text-muted mb-1">Etapa del deal</Form.Label>
            <Form.Select
              size="sm"
              value={draftFilters.dealStage}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, dealStage: e.target.value }))}
            >
              <option value="">Todas</option>
              <option value="new_lead">Nuevo lead</option>
              <option value="contacted">Contactado</option>
              <option value="qualified">Calificado</option>
              <option value="qualification">Calificación (legacy)</option>
              <option value="proposal">Propuesta</option>
              <option value="negotiation">Negociación</option>
              <option value="closed_won">Ganado</option>
              <option value="closed_lost">Perdido</option>
            </Form.Select>
          </Form.Group>
          <div className="d-flex gap-2 mb-2">
            <Form.Group className="w-100">
              <Form.Label className="small text-muted mb-1">Desde</Form.Label>
              <Form.Control
                size="sm"
                type="date"
                value={draftFilters.dealOpenedFrom}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, dealOpenedFrom: e.target.value }))}
              />
            </Form.Group>
            <Form.Group className="w-100">
              <Form.Label className="small text-muted mb-1">Hasta</Form.Label>
              <Form.Control
                size="sm"
                type="date"
                value={draftFilters.dealOpenedTo}
                onChange={(e) => setDraftFilters((prev) => ({ ...prev, dealOpenedTo: e.target.value }))}
              />
            </Form.Group>
          </div>
          <Form.Group className="mb-2">
            <Form.Label className="small text-muted mb-1">Responsable</Form.Label>
            <Form.Select
              size="sm"
              value={draftFilters.responsible}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, responsible: e.target.value }))}
            >
              <option value="">Todos</option>
              {responsibleOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <div className="d-flex justify-content-between align-items-center gap-2">
            <Button
              size="sm"
              variant="link"
              className="p-0 text-decoration-none"
              onClick={() => {
                const empty = {
                  dealStage: "",
                  dealOpenedFrom: "",
                  dealOpenedTo: "",
                  responsible: "",
                };
                setDraftFilters(empty);
                onClearFilters();
              }}
            >
              Limpiar filtros
            </Button>
            <Button size="sm" variant="primary" onClick={() => onApplyFilters(draftFilters)}>
              Aplicar filtros
            </Button>
          </div>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        {activeFilterBadges.length > 0 && (
          <div className="mb-2 app-chat-filter-summary d-flex flex-wrap gap-1">
            {activeFilterBadges.map((item) => (
              <Badge key={item.key} bg="secondary" className="app-chat-filter-badge">
                {item.label}
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 ms-1 app-chat-filter-remove"
                  onClick={() => removeSingleFilter(item.key)}
                  aria-label={`Quitar filtro ${item.label}`}
                >
                  <i className="bi bi-x-lg" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      {loading ? (
        <div className="p-2">
          <Spinner animation="border" size="sm" />
        </div>
      ) : (
        <div className="d-flex flex-column gap-1 app-chat-sidebar-list">
          {conversations?.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`btn btn-sm text-start app-chat-sidebar-item ${
                c.id === activeId ? "btn-primary" : "btn-light"
              }`}
              onClick={() => onSelect(c.id)}
            >
              <div className="d-flex align-items-start gap-2">
                <div className="app-avatar">{initials(c.contact_name)}</div>
                <div className="flex-grow-1 overflow-hidden">
                  <div className="small fw-medium d-flex justify-content-between align-items-center gap-2">
                    <span className="text-truncate">{c.contact_name}</span>
                    {c.unread_count > 0 && <span className="badge bg-danger">{c.unread_count}</span>}
                  </div>
                  <div className="text-truncate small text-muted">{c.last_message_preview || "Sin mensajes"}</div>
                  {c.deal_title && (
                    <div className="small text-muted text-truncate">
                      Deal: {c.deal_title} {c.deal_stage ? `· ${c.deal_stage}` : ""}
                    </div>
                  )}
                  {c.human_handoff_requested && (
                    <Badge bg="warning" text="dark" className="mt-1">
                      Handoff
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

ChatSidebar.propTypes = {
  loading: PropTypes.bool,
  conversations: PropTypes.arrayOf(PropTypes.object),
  activeId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  query: PropTypes.string.isRequired,
  onQueryChange: PropTypes.func.isRequired,
  channelFilter: PropTypes.string.isRequired,
  onChannelFilterChange: PropTypes.func.isRequired,
  filters: PropTypes.shape({
    dealStage: PropTypes.string,
    dealOpenedFrom: PropTypes.string,
    dealOpenedTo: PropTypes.string,
    responsible: PropTypes.string,
  }).isRequired,
  onApplyFilters: PropTypes.func.isRequired,
  onClearFilters: PropTypes.func.isRequired,
  responsibleOptions: PropTypes.arrayOf(PropTypes.object),
};

export default ChatSidebar;
