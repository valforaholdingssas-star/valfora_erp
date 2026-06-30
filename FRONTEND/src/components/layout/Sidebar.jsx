import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import { Form, Nav } from "react-bootstrap";
import { NavLink, useLocation } from "react-router-dom";

import { fetchWikiDocuments } from "../../api/wiki.js";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useNotifications } from "../../contexts/NotificationContext.jsx";
import logoMark from "../../assets/valfora-logo-transparent.png";

const linkClass = ({ isActive }) =>
  `nav-link app-nav-link d-flex align-items-center gap-2 px-2 ${isActive ? "active" : ""}`;

const Sidebar = ({ collapsed }) => {
  const { pathname } = useLocation();
  const { hasModuleAccess, user } = useAuth();
  const { chatUnreadCount, linkedinUnreadCount } = useNotifications();
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState({});

  const showCRM = hasModuleAccess("crm", "view");
  const showCalendar = hasModuleAccess("calendar", "view");
  const showChat = hasModuleAccess("chat", "view");
  const showAiSettings = hasModuleAccess("ai_config", "view");
  const showLinkedIn = hasModuleAccess("linkedin", "view");
  const showUserSettings = hasModuleAccess("users", "view");
  const showFinance = hasModuleAccess("finance", "view");
  const showWiki = hasModuleAccess("wiki", "view");
  const canEditWiki = hasModuleAccess("wiki", "edit");
  const showWhatsAppSettings = hasModuleAccess("whatsapp", "view");
  const showSettingsSection = showAiSettings || showLinkedIn || showUserSettings || showWhatsAppSettings;
  const [wikiItems, setWikiItems] = useState([]);

  useEffect(() => {
    if (!showWiki) {
      setWikiItems([]);
      return;
    }

    let mounted = true;
    const loadWikiItems = async () => {
      try {
        const data = await fetchWikiDocuments({ published: true, ordering: "menu_order,title", page_size: 200 });
        if (!mounted) return;
        const items = (data.results || []).map((doc) => ({
          to: `/wiki/${doc.slug}`,
          label: doc.title,
          icon: "bi-file-earmark-richtext",
        }));
        setWikiItems(items);
      } catch {
        if (!mounted) return;
        setWikiItems([]);
      }
    };

    void loadWikiItems();
    return () => {
      mounted = false;
    };
  }, [showWiki, pathname]);

  const sections = useMemo(() => {
    const base = [
      {
        key: "general",
        label: "General",
        tone: "slate",
        items: [
          { to: "/", label: "Inicio", icon: "bi-house-door" },
          showCalendar ? { to: "/calendar", label: "Calendario", icon: "bi-calendar3" } : null,
          showChat ? { to: "/chat", label: "Chat", icon: "bi-chat-dots" } : null,
        ].filter(Boolean),
      },
      {
        key: "crm",
        label: "CRM",
        tone: "violet",
        items: showCRM
          ? [
              { to: "/crm", label: "Dashboard CRM", icon: "bi-bar-chart-line" },
              { to: "/crm/contacts", label: "Contactos", icon: "bi-people" },
              { to: "/crm/companies", label: "Empresas", icon: "bi-buildings" },
              { to: "/crm/pipeline", label: "Pipeline", icon: "bi-kanban" },
            ]
          : [],
      },
      {
        key: "finance",
        label: "Finanzas",
        tone: "emerald",
        items: showFinance
          ? [
              { to: "/finance/contracts", label: "Contratos", icon: "bi-file-earmark-text" },
              { to: "/finance/invoices", label: "Facturas", icon: "bi-receipt" },
              { to: "/finance/payments", label: "Pagos", icon: "bi-cash-stack" },
              { to: "/finance/receivables", label: "Cartera", icon: "bi-collection" },
              { to: "/finance/dashboard", label: "Dashboard financiero", icon: "bi-graph-up-arrow" },
            ]
          : [],
      },
      {
        key: "linkedin",
        label: "LinkedIn",
        tone: "violet",
        items: showLinkedIn
          ? [
              { to: "/linkedin", label: "Dashboard", icon: "bi-speedometer2" },
              { to: "/linkedin/prospects", label: "Prospectos", icon: "bi-people" },
              { to: "/linkedin/pipeline", label: "Pipeline", icon: "bi-kanban" },
              { to: "/linkedin/inbox", label: "Inbox", icon: "bi-chat-left-text" },
              { to: "/linkedin/searches", label: "Búsquedas", icon: "bi-search" },
              { to: "/linkedin/invitations", label: "Invitaciones", icon: "bi-person-plus" },
              { to: "/linkedin/templates", label: "Plantillas", icon: "bi-card-text" },
            ]
          : [],
      },
      {
        key: "wiki",
        label: "Wiki",
        tone: "amber",
        items: showWiki
          ? [
              canEditWiki ? { to: "/wiki", label: "Gestión Wiki", icon: "bi-journal-code" } : null,
              ...wikiItems,
            ].filter(Boolean)
          : [],
      },
      {
        key: "settings",
        label: "Configuración",
        tone: "rose",
        items: showSettingsSection
          ? [
              showUserSettings ? { to: "/settings/users", label: "Usuarios", icon: "bi-person-gear" } : null,
              showUserSettings ? { to: "/settings/activity-log", label: "Log de actividad", icon: "bi-journal-text" } : null,
              showCRM ? { to: "/settings/companies", label: "Empresas (gestión)", icon: "bi-buildings" } : null,
              showAiSettings ? { to: "/settings/ai", label: "Configuración IA", icon: "bi-cpu" } : null,
              showLinkedIn ? { to: "/settings/linkedin", label: "LinkedIn (vista unificada)", icon: "bi-linkedin" } : null,
              showWhatsAppSettings ? { to: "/settings/whatsapp/accounts", label: "WhatsApp Cuentas", icon: "bi-whatsapp" } : null,
              showWhatsAppSettings ? { to: "/settings/whatsapp/phone-numbers", label: "WhatsApp Números", icon: "bi-telephone" } : null,
              showWhatsAppSettings ? { to: "/settings/whatsapp/templates", label: "WhatsApp Templates", icon: "bi-chat-square-text" } : null,
              showWhatsAppSettings ? { to: "/settings/whatsapp/profile", label: "WhatsApp Perfil", icon: "bi-person-vcard" } : null,
              showWhatsAppSettings ? { to: "/settings/whatsapp/analytics", label: "WhatsApp Analítica", icon: "bi-bar-chart-line" } : null,
              showCRM ? { to: "/settings/lead-engine", label: "Automatización Leads", icon: "bi-diagram-3" } : null,
              showCRM ? { to: "/settings/lead-engine/pipeline", label: "Pipeline Auto", icon: "bi-bezier2" } : null,
              showCRM ? { to: "/settings/lead-engine/dashboard", label: "Dashboard Auto", icon: "bi-speedometer2" } : null,
            ].filter(Boolean)
          : [],
      },
    ];
    return base.filter((section) => section.items.length > 0);
  }, [
    showAiSettings,
    showLinkedIn,
    showCRM,
    showCalendar,
    showChat,
    showFinance,
    showWiki,
    canEditWiki,
    wikiItems,
    showSettingsSection,
    showUserSettings,
    showWhatsAppSettings,
  ]);

  const filteredSections = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sections;
    return sections
      .map((section) => {
        const sectionMatch = section.label.toLowerCase().includes(term);
        const items = sectionMatch
          ? section.items
          : section.items.filter((item) => item.label.toLowerCase().includes(term));
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [query, sections]);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      sections.forEach((section) => {
        if (next[section.key] === undefined) {
          next[section.key] = section.items.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
        }
      });
      return next;
    });
  }, [pathname, sections]);

  useEffect(() => {
    if (!query.trim()) return;
    setOpenGroups((prev) => {
      const next = { ...prev };
      filteredSections.forEach((section) => {
        next[section.key] = true;
      });
      return next;
    });
  }, [filteredSections, query]);

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <aside
      className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`}
      style={{ minHeight: "calc(100vh - 56px)" }}
    >
      {collapsed ? (
        <div className="app-sidebar-shell">
          <div className="app-sidebar-brand app-sidebar-brand-collapsed">
            <img src={logoMark} alt="Valfora" className="app-sidebar-brand-logo" />
          </div>
          <div className="app-sidebar-scroll">
            <Nav className="flex-column gap-1">
              {sections.flatMap((section) =>
                section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={linkClass}
                    title={item.label}
                  >
                    <i className={`bi ${item.icon}`} />
                    {item.to === "/chat" && chatUnreadCount > 0 && (
                      <span className="badge rounded-pill bg-danger ms-auto">
                        {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                      </span>
                    )}
                    {item.to === "/settings/linkedin" && linkedinUnreadCount > 0 && (
                      <span className="badge rounded-pill bg-danger ms-auto">
                        {linkedinUnreadCount > 99 ? "99+" : linkedinUnreadCount}
                      </span>
                    )}
                  </NavLink>
                )),
              )}
            </Nav>
          </div>
        </div>
      ) : (
        <div className="app-sidebar-shell">
          <div className="app-sidebar-brand">
            <img src={logoMark} alt="Valfora" className="app-sidebar-brand-logo" />
            <div className="app-sidebar-brand-copy">
              <div className="app-sidebar-brand-title">VALFORA</div>
              <div className="app-sidebar-brand-subtitle">HOLDINGS</div>
            </div>
          </div>
          <div className="app-sidebar-search">
            <div className="app-sidebar-search-shell">
              <i className="bi bi-search" />
              <Form.Control
                size="sm"
                value={query}
                placeholder="Buscar opción..."
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar opción del menú"
              />
            </div>
          </div>
          <div className="app-sidebar-scroll">
            {filteredSections.map((section) => {
              const expanded = openGroups[section.key] ?? false;
              return (
                <div key={section.key} className={`app-sidebar-group tone-${section.tone || "slate"}`}>
                  <button
                    type="button"
                    className="app-sidebar-group-toggle"
                    onClick={() => toggleGroup(section.key)}
                    aria-expanded={expanded}
                  >
                    <span className="app-sidebar-group-title">{section.label}</span>
                    <i className={`bi bi-chevron-down ${expanded ? "is-open" : ""}`} />
                  </button>
                  {expanded && (
                    <Nav className="flex-column gap-1 mb-2">
                      {section.items.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.to === "/"} className={linkClass}>
                          <i className={`bi ${item.icon}`} />
                          <span>{item.label}</span>
                          {item.to === "/chat" && chatUnreadCount > 0 && (
                            <span className="badge rounded-pill bg-danger ms-auto">
                              {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
                            </span>
                          )}
                          {item.to === "/settings/linkedin" && linkedinUnreadCount > 0 && (
                            <span className="badge rounded-pill bg-danger ms-auto">
                              {linkedinUnreadCount > 99 ? "99+" : linkedinUnreadCount}
                            </span>
                          )}
                        </NavLink>
                      ))}
                    </Nav>
                  )}
                </div>
              );
            })}
            {!filteredSections.length && (
              <p className="small text-muted px-2 mt-2 mb-0">No hay resultados para tu búsqueda.</p>
            )}
          </div>
          <div className="app-sidebar-user">
            <div className="app-sidebar-user-avatar">
              {(user?.first_name?.[0] || user?.email?.[0] || "V").toUpperCase()}
            </div>
            <div className="app-sidebar-user-copy">
              <div className="app-sidebar-user-name">
                {[user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() || user?.email || "Usuario"}
              </div>
              <div className="app-sidebar-user-role">{user?.role || "super_admin"}</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

Sidebar.propTypes = {
  collapsed: PropTypes.bool.isRequired,
};

export default Sidebar;
