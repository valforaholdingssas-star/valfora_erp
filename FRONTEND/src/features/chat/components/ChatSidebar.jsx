import { forwardRef, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Dropdown, Form, Spinner } from "react-bootstrap";

const SidebarIconToggle = forwardRef(({ children, onClick, className, ...props }, ref) => (
  <button
    type="button"
    {...props}
    ref={ref}
    className={className}
    onClick={(event) => {
      event.preventDefault();
      onClick?.(event);
    }}
  >
    {children}
  </button>
));
SidebarIconToggle.displayName = "SidebarIconToggle";
SidebarIconToggle.propTypes = {
  children: PropTypes.node,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

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

const buildSidebarMeta = (conversation, stageLabels = {}, statusFilter = "open") => {
  const parts = [];
  const isClosed = conversation?.status === "archived" || conversation?.is_whatsapp_window_closed;
  // Avoid repeating "Cerrado/Abierto" when the list is already filtered by that status.
  if (statusFilter !== "closed" && statusFilter !== "open") {
    parts.push({
      key: "status",
      label: isClosed ? "Cerrado" : "Abierto",
      tone: isClosed ? "status-closed" : "status-open",
    });
  } else if (statusFilter === "open" && isClosed) {
    parts.push({ key: "status", label: "Cerrado", tone: "status-closed" });
  }

  const stageLabel = resolveStageLabel(conversation, stageLabels);
  if (stageLabel) {
    parts.push({
      key: "stage",
      label: stageLabel,
      tone: "stage",
    });
  }

  const windowLabel = formatWindowTagLabel(conversation);
  if (windowLabel && isClosed) {
    parts.push({
      key: "window",
      label: windowLabel,
      tone: "window-closed",
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
  onCollapse,
  className = "",
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectedLineLabel = useMemo(() => {
    if (!selectedWhatsAppLine) return "Todas las líneas";
    const line = (whatsAppLines || []).find((item) => String(item.id) === String(selectedWhatsAppLine));
    if (!line) return "Línea";
    return line.line_name || line.internal_name || line.verified_name || line.display_phone_number || "Línea";
  }, [selectedWhatsAppLine, whatsAppLines]);

  const statusLabel = statusFilter === "closed" ? "Cerrados" : "Abiertos";
  const activeFilterCount = [query?.trim(), statusFilter !== "open", Boolean(selectedWhatsAppLine)].filter(Boolean).length;

  const buildDealLine = (conversation) => {
    const title = conversation?.deal_title || null;
    if (!title) return "";
    return title;
  };

  return (
    <div className={`h-100 app-chat-sidebar ${className}`}>
      <div className="app-chat-sidebar-head">
        <div className="app-chat-sidebar-head-row">
          <div className="app-chat-sidebar-head-copy">
            <div className="app-chat-sidebar-title">Bandeja</div>
            <div className="app-chat-sidebar-subtitle">
              {totalCount || conversations?.length || 0} · {statusLabel}
            </div>
          </div>
          <div className="app-chat-sidebar-head-actions">
            <Dropdown
              show={filtersOpen}
              onToggle={(next) => setFiltersOpen(Boolean(next))}
              align="end"
              autoClose="outside"
            >
              <Dropdown.Toggle
                as={SidebarIconToggle}
                className={`app-chat-sidebar-icon-btn ${activeFilterCount > 0 ? "is-active" : ""}`}
                aria-label="Buscar y filtrar bandeja"
              >
                <i className="bi bi-funnel" aria-hidden="true" />
                {activeFilterCount > 0 ? <span className="app-chat-sidebar-icon-badge">{activeFilterCount}</span> : null}
              </Dropdown.Toggle>
              <Dropdown.Menu className="app-chat-filters-menu p-3" popperConfig={{ strategy: "fixed" }}>
                <div className="app-chat-filters-menu-title">Buscar y filtrar</div>
                <Form.Control
                  size="sm"
                  placeholder="Buscar chats"
                  className="mb-3 app-chat-sidebar-search"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  autoFocus={filtersOpen}
                />
                <div className="app-chat-filters-section-label">Estado</div>
                <div className="app-chat-filters-segment mb-3">
                  <button
                    type="button"
                    className={`app-chat-filters-segment-btn ${statusFilter === "open" ? "is-active" : ""}`}
                    onClick={() => onStatusFilterChange("open")}
                  >
                    Abiertos
                  </button>
                  <button
                    type="button"
                    className={`app-chat-filters-segment-btn ${statusFilter === "closed" ? "is-active" : ""}`}
                    onClick={() => onStatusFilterChange("closed")}
                  >
                    Cerrados
                  </button>
                </div>
                {(whatsAppLines || []).length > 0 ? (
                  <>
                    <div className="app-chat-filters-section-label">Línea WhatsApp</div>
                    <div className="app-chat-filters-stack">
                      <button
                        type="button"
                        className={`app-chat-filters-option ${selectedWhatsAppLine === "" ? "is-active" : ""}`}
                        onClick={() => onSelectWhatsAppLine("")}
                      >
                        <span>Todas</span>
                        <span>{totalCount || conversations?.length || 0}</span>
                      </button>
                      {whatsAppLines.map((line) => {
                        const label =
                          line.line_name || line.internal_name || line.verified_name || line.display_phone_number;
                        const count = whatsAppLineCounts?.[line.id] || 0;
                        return (
                          <button
                            key={line.id}
                            type="button"
                            className={`app-chat-filters-option ${selectedWhatsAppLine === line.id ? "is-active" : ""}`}
                            onClick={() => onSelectWhatsAppLine(line.id)}
                            title={label}
                          >
                            <span className="app-chat-filters-option-label">{label}</span>
                            <span>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                <div className="app-chat-filters-menu-foot">
                  <span className="app-chat-filters-channel">
                    <i className="bi bi-whatsapp" aria-hidden="true" />
                    WhatsApp
                  </span>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setFiltersOpen(false)}>
                    Listo
                  </button>
                </div>
              </Dropdown.Menu>
            </Dropdown>
            {typeof onCollapse === "function" ? (
              <button
                type="button"
                className="app-chat-sidebar-icon-btn d-none d-lg-inline-flex"
                onClick={onCollapse}
                aria-label="Ocultar bandeja"
                title="Ocultar bandeja"
              >
                <i className="bi bi-layout-sidebar" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        {(query?.trim() || selectedWhatsAppLine) && (
          <div className="app-chat-sidebar-active-filters">
            {query?.trim() ? <span className="app-chat-sidebar-active-chip">“{query.trim()}”</span> : null}
            {selectedWhatsAppLine ? <span className="app-chat-sidebar-active-chip">{selectedLineLabel}</span> : null}
          </div>
        )}
      </div>

      {loading && (!conversations || conversations.length === 0) ? (
        <div className="p-2">
          <Spinner animation="border" size="sm" />
        </div>
      ) : (
        <div className="app-chat-sidebar-list">
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
            const dealTitle = buildDealLine(c);
            const meta = buildSidebarMeta(c, stageLabels, statusFilter);
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
                    {preview ? <div className="app-chat-sidebar-item-subtitle">{preview}</div> : null}
                    {dealTitle ? <div className="app-chat-sidebar-item-deal">{dealTitle}</div> : null}
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
  onCollapse: PropTypes.func,
  className: PropTypes.string,
};

export default ChatSidebar;
