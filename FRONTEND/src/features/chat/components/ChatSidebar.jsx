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
  whatsAppLines,
  selectedWhatsAppLine,
  onSelectWhatsAppLine,
  whatsAppLineCounts,
  className = "",
}) => {
  return (
    <div className={`p-2 h-100 app-chat-sidebar ${className}`}>
      <div className="app-chat-sidebar-head">
        <div className="d-flex justify-content-between align-items-center px-2 mb-2">
          <div>
            <div className="app-chat-sidebar-title">Bandeja</div>
            <div className="app-chat-sidebar-subtitle">{conversations?.length || 0} conversaciones</div>
          </div>
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
        {channelFilter === "whatsapp" && (whatsAppLines || []).length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-2">
            <Button
              size="sm"
              variant={selectedWhatsAppLine === "" ? "dark" : "outline-secondary"}
              onClick={() => onSelectWhatsAppLine("")}
            >
              Todas
              <span className="ms-1">({conversations?.length || 0})</span>
            </Button>
            {whatsAppLines.map((line) => {
              const label = line.line_name || line.internal_name || line.verified_name || line.display_phone_number;
              const count = whatsAppLineCounts?.[line.id] || 0;
              return (
                <Button
                  key={line.id}
                  size="sm"
                  variant={selectedWhatsAppLine === line.id ? "dark" : "outline-secondary"}
                  onClick={() => onSelectWhatsAppLine(line.id)}
                >
                  {label}
                  <span className="ms-1">({count})</span>
                </Button>
              );
            })}
          </div>
        )}
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
              className={`btn btn-sm text-start app-chat-sidebar-item ${c.id === activeId ? "is-active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="d-flex align-items-start gap-2">
                <div className="app-avatar">{initials(c.contact_name)}</div>
                <div className="flex-grow-1 overflow-hidden">
                  <div className="app-chat-sidebar-item-top">
                    <span className="app-chat-sidebar-item-name text-truncate">{c.contact_name}</span>
                    {c.last_message_at && (
                      <span className="app-chat-sidebar-item-time">
                        {new Date(c.last_message_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="text-truncate small app-chat-sidebar-item-preview">{c.last_message_preview || "Sin mensajes"}</div>
                  {c.deal_title && (
                    <div className="small text-muted text-truncate app-chat-sidebar-item-deal">
                      Deal: {c.deal_title}
                    </div>
                  )}
                  <div className="d-flex align-items-center gap-2 flex-wrap mt-1">
                    {c.__sla && c.__sla.status !== "none" && (
                      <span className={`app-chat-sla-chip is-${c.__sla.status}`}>
                        SLA: {c.__sla.label}
                      </span>
                    )}
                    {c.unread_count > 0 && <span className="app-chat-unread-badge">{c.unread_count}</span>}
                  </div>
                  {c.whatsapp_line_name && (
                    <div className="small text-muted text-truncate app-chat-sidebar-item-line">
                      Línea: {c.whatsapp_line_name}
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
  whatsAppLines: PropTypes.arrayOf(PropTypes.object),
  selectedWhatsAppLine: PropTypes.string,
  onSelectWhatsAppLine: PropTypes.func,
  whatsAppLineCounts: PropTypes.object,
  className: PropTypes.string,
};

export default ChatSidebar;
