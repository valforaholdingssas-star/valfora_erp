import PropTypes from "prop-types";
import { Badge, Button, Form, Spinner } from "react-bootstrap";

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
  className = "",
}) => {
  return (
    <div className={`p-2 h-100 app-chat-sidebar ${className}`}>
      <div className="app-chat-sidebar-head">
        <div className="d-flex justify-content-between align-items-center px-2 mb-2">
          <div>
            <h2 className="h6 mb-0">Bandeja</h2>
            <div className="small text-muted">{conversations?.length || 0} conversaciones</div>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            aria-label="Nueva conversación"
            title="Próximamente"
            disabled
          >
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
            variant={channelFilter === "" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("")}
          >
            Todos
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="p-2">
          <Spinner animation="border" size="sm" />
        </div>
      ) : (
        <div className="d-flex flex-column gap-1 app-chat-sidebar-list">
          {(!conversations || conversations.length === 0) && (
            <div className="app-empty-state-mini">
              <i className="bi bi-chat-left-text" />
              <p className="mb-0">No hay conversaciones para esos filtros.</p>
            </div>
          )}
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
                  {c.__sla && c.__sla.status !== "none" && (
                    <Badge
                      bg={
                        c.__sla.status === "critical"
                          ? "danger"
                          : c.__sla.status === "warn"
                            ? "warning"
                            : "success"
                      }
                      text={c.__sla.status === "warn" ? "dark" : "light"}
                      className="mt-1 ms-1"
                    >
                      SLA: {c.__sla.label}
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
  className: PropTypes.string,
};

export default ChatSidebar;
