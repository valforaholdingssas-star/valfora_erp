import PropTypes from "prop-types";
import { Button, Form, Spinner } from "react-bootstrap";

const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase() || "")
    .join("") || "C";

const formatWindowTagLabel = (conversation) => {
  if (conversation?.status === "archived" || conversation?.is_whatsapp_window_closed) {
    return "24h vencidas";
  }
  if (conversation?.__remainingWindowLabel) {
    return conversation.__remainingWindowLabel;
  }
  return null;
};

const computePendingReplyLabel = (conversation) => {
  const label = conversation?.__sla?.label || "";
  if (!label || label === "Sin inbound" || label === "Sin dato") return null;
  return (
    <span className={`app-chat-sidebar-item-meta-chip is-sla is-${conversation?.__sla?.status || "none"}`}>
      SLA: {label}
    </span>
  );
};

const buildSidebarMeta = (conversation) => {
  const parts = [];
  if (conversation?.whatsapp_line_name) {
    parts.push({
      key: "line",
      label: conversation.whatsapp_line_name,
      tone: "line",
    });
  }
  const windowLabel = formatWindowTagLabel(conversation);
  if (windowLabel) {
    parts.push({
      key: "window",
      label: windowLabel,
      tone: conversation?.is_whatsapp_window_closed || conversation?.status === "archived" ? "window-closed" : "window",
    });
  }
  if (conversation?.status === "archived" || conversation?.is_whatsapp_window_closed) {
    parts.push({
      key: "closed",
      label: "Cerrado",
      tone: "status-closed",
    });
  }
  return parts;
};

const ChatSidebar = ({
  loading,
  conversations,
  totalCount,
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
  statusFilter,
  onStatusFilterChange,
  className = "",
}) => {
  return (
    <div className={`p-2 h-100 app-chat-sidebar ${className}`}>
      <div className="app-chat-sidebar-head">
        <div className="d-flex justify-content-between align-items-center px-2 mb-2">
          <div>
            <div className="app-chat-sidebar-title">Bandeja</div>
            <div className="app-chat-sidebar-subtitle">{totalCount || conversations?.length || 0} conversaciones</div>
          </div>
        </div>
        <Form.Control
          size="sm"
          placeholder="Buscar chats"
          className="mb-2"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="d-flex gap-2 mb-3 flex-wrap app-chat-sidebar-switches">
          <Button
            size="sm"
            variant={channelFilter === "whatsapp" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("whatsapp")}
            className="app-chat-sidebar-switch-btn"
          >
            WhatsApp
          </Button>
          <Button
            size="sm"
            variant={channelFilter === "" ? "primary" : "outline-secondary"}
            onClick={() => onChannelFilterChange("")}
            className="app-chat-sidebar-switch-btn"
          >
            Todos
          </Button>
        </div>
        {channelFilter === "whatsapp" && (
          <div className="d-flex gap-2 mb-3 flex-wrap app-chat-sidebar-switches">
            <Button
              size="sm"
              variant={statusFilter === "open" ? "dark" : "outline-secondary"}
              onClick={() => onStatusFilterChange("open")}
              className="app-chat-sidebar-switch-btn"
            >
              Abiertos
            </Button>
            <Button
              size="sm"
              variant={statusFilter === "closed" ? "dark" : "outline-secondary"}
              onClick={() => onStatusFilterChange("closed")}
              className="app-chat-sidebar-switch-btn"
            >
              Cerrados
            </Button>
          </div>
        )}
        {channelFilter === "whatsapp" && (whatsAppLines || []).length > 0 && (
          <div className="d-flex flex-wrap gap-2 mb-3 app-chat-sidebar-line-switches app-chat-sidebar-switches">
            <Button
              size="sm"
              variant={selectedWhatsAppLine === "" ? "dark" : "outline-secondary"}
              onClick={() => onSelectWhatsAppLine("")}
              className="app-chat-sidebar-switch-btn app-chat-sidebar-switch-btn--count"
            >
              Todas
              <span className="ms-1">({totalCount || conversations?.length || 0})</span>
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
                  className="app-chat-sidebar-switch-btn app-chat-sidebar-switch-btn--count"
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
        <div className="d-flex flex-column gap-2 app-chat-sidebar-list">
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
              className={`app-chat-sidebar-item ${c.id === activeId ? "is-active" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="app-chat-sidebar-item-shell">
                <div className="app-avatar">{initials(c.contact_name)}</div>
                <div className="app-chat-sidebar-item-body">
                  <div className="app-chat-sidebar-item-top">
                    <span className="app-chat-sidebar-item-name">{c.contact_name}</span>
                    <div className="app-chat-sidebar-item-timecluster">
                      {Number(c.unread_count || 0) > 0 ? (
                        <span className="app-chat-sidebar-item-unread">{Number(c.unread_count)}</span>
                      ) : null}
                      {c.last_message_at && (
                        <span className="app-chat-sidebar-item-time">
                          {new Date(c.last_message_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="app-chat-sidebar-item-statusline">
                    {computePendingReplyLabel(c)}
                    {buildSidebarMeta(c).map((tag) => (
                      <span
                        key={`${c.id}-${tag.key}`}
                        className={`app-chat-sidebar-item-meta-chip is-${tag.tone}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
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
  totalCount: PropTypes.number,
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
  statusFilter: PropTypes.string,
  onStatusFilterChange: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default ChatSidebar;
