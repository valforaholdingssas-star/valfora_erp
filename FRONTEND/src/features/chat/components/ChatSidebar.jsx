import PropTypes from "prop-types";
import { Form, Spinner } from "react-bootstrap";

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

const resolveStageLabel = (conversation, stageLabels = {}) => {
  const stageKey = conversation?.deal_stage || conversation?.latest_deal_stage || "";
  if (!stageKey) return "";
  return stageLabels[stageKey] || stageKey;
};

const buildSidebarMeta = (conversation, stageLabels = {}) => {
  const parts = [];
  const isClosed = conversation?.status === "archived" || conversation?.is_whatsapp_window_closed;
  parts.push({
    key: "status",
    label: isClosed ? "Cerrado" : "Abierto",
    tone: isClosed ? "status-closed" : "status-open",
  });
  const stageLabel = resolveStageLabel(conversation, stageLabels);
  if (stageLabel) {
    parts.push({
      key: "stage",
      label: stageLabel,
      tone: "stage",
    });
  }
  const windowLabel = formatWindowTagLabel(conversation);
  if (windowLabel) {
    parts.push({
      key: "window",
      label: windowLabel,
      tone: isClosed ? "window-closed" : "window",
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
  whatsAppLines,
  selectedWhatsAppLine,
  onSelectWhatsAppLine,
  whatsAppLineCounts,
  statusFilter,
  onStatusFilterChange,
  stageLabels = {},
  className = "",
}) => {
  const buildDealLine = (conversation) => {
    const title = conversation?.deal_title || null;
    if (!title) return "";
    return `Deal: ${title}`;
  };

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
          className="mb-2 app-chat-sidebar-search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="app-chat-sidebar-chip-grid mb-2">
          <span className="app-chat-sidebar-chip is-channel is-active" aria-label="Canal WhatsApp">
            <i className="bi bi-whatsapp" aria-hidden="true" />
            WhatsApp
          </span>
        </div>
        <div className="app-chat-sidebar-chip-grid mb-2">
          <button
            type="button"
            className={`app-chat-sidebar-chip ${statusFilter === "open" ? "is-active is-dark" : ""}`}
            onClick={() => onStatusFilterChange("open")}
          >
            Abiertos
          </button>
          <button
            type="button"
            className={`app-chat-sidebar-chip ${statusFilter === "closed" ? "is-active is-dark" : ""}`}
            onClick={() => onStatusFilterChange("closed")}
          >
            Cerrados
          </button>
        </div>
        {(whatsAppLines || []).length > 0 && (
          <div className="app-chat-sidebar-chip-grid mb-3">
            <button
              type="button"
              className={`app-chat-sidebar-chip app-chat-sidebar-chip--count ${selectedWhatsAppLine === "" ? "is-active is-dark" : ""}`}
              onClick={() => onSelectWhatsAppLine("")}
            >
              Todas
              <span>({totalCount || conversations?.length || 0})</span>
            </button>
            {whatsAppLines.map((line) => {
              const label = line.line_name || line.internal_name || line.verified_name || line.display_phone_number;
              const count = whatsAppLineCounts?.[line.id] || 0;
              return (
                <button
                  key={line.id}
                  type="button"
                  className={`app-chat-sidebar-chip app-chat-sidebar-chip--count ${selectedWhatsAppLine === line.id ? "is-active is-dark" : ""}`}
                  onClick={() => onSelectWhatsAppLine(line.id)}
                  title={label}
                >
                  <span className="app-chat-sidebar-chip-label">{label}</span>
                  <span>({count})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {loading && (!conversations || conversations.length === 0) ? (
        <div className="p-2">
          <Spinner animation="border" size="sm" />
        </div>
      ) : (
        <div className="d-flex flex-column gap-2 app-chat-sidebar-list">
          {loading ? (
            <div className="px-2 pb-1">
              <Spinner animation="border" size="sm" />
            </div>
          ) : null}
          {(!conversations || conversations.length === 0) && (
            <div className="app-empty-state-mini">
              <i className="bi bi-chat-left-text" />
              <p className="mb-0">No hay conversaciones para esos filtros.</p>
            </div>
          )}
          {conversations?.map((c) => {
            const preview = (c.last_message_preview || "").trim();
            const dealLine = buildDealLine(c);
            const subtitle = preview || dealLine;
            const meta = buildSidebarMeta(c, stageLabels);
            return (
              <button
                key={c.id}
                type="button"
                className={`app-chat-sidebar-item ${String(c.id) === String(activeId) ? "is-active" : ""}`}
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
                            {new Date(c.last_message_at).toLocaleTimeString("es-CO", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    {subtitle ? <div className="app-chat-sidebar-item-subtitle">{subtitle}</div> : null}
                    {preview && dealLine ? (
                      <div className="app-chat-sidebar-item-deal">{dealLine}</div>
                    ) : null}
                    {meta.length > 0 ? (
                      <div className="app-chat-sidebar-item-statusline">
                        {meta.map((tag) => (
                          <span
                            key={`${c.id}-${tag.key}`}
                            className={`app-chat-sidebar-item-meta-token is-${tag.tone}`}
                          >
                            {tag.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
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
  whatsAppLines: PropTypes.arrayOf(PropTypes.object),
  selectedWhatsAppLine: PropTypes.string,
  onSelectWhatsAppLine: PropTypes.func,
  whatsAppLineCounts: PropTypes.object,
  statusFilter: PropTypes.string,
  onStatusFilterChange: PropTypes.func.isRequired,
  stageLabels: PropTypes.objectOf(PropTypes.string),
  className: PropTypes.string,
};

export default ChatSidebar;
