import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Form, Modal, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import {
  fetchAllDealCalls,
  fetchCompanies,
  fetchDealCallsCalendar,
  fetchDeals,
  fetchPipelineStages,
  moveDealStage,
} from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import LogDealCallModal from "../components/LogDealCallModal.jsx";
import QuickEditDealModal from "../components/QuickEditDealModal.jsx";
import { resolveUserDisplayName } from "../utils/formatters.js";

const CALL_STAGE_KEY = "realizar_llamada";
const QUEUE_PAGE_SIZE = 10;
const QUICK_OUTCOMES = [
  { stage: "closed_lost", label: "Cerrar lead", variant: "outline-danger" },
  { stage: "unanswered", label: "Sin respuesta", variant: "outline-secondary" },
  { stage: "closed_won", label: "Ganado", variant: "outline-success" },
];

const DEAL_SOURCES = [
  ["", "Todos los orígenes"],
  ["whatsapp", "WhatsApp"],
  ["manual", "Manual"],
  ["website", "Website"],
  ["referral", "Referido"],
  ["other", "Otro"],
];

const fetchAllPages = async (fetcher, params = {}, pageSize = 100) => {
  let page = 1;
  let expectedCount = null;
  const results = [];

  while (true) {
    const payload = await fetcher({ ...params, page, page_size: pageSize });
    const rows = payload?.results || [];
    if (expectedCount === null) {
      expectedCount = Number(payload?.count || rows.length || 0);
    }
    results.push(...rows);
    if (!rows.length || results.length >= expectedCount) break;
    page += 1;
  }

  return { count: expectedCount ?? results.length, results };
};

const monthBounds = (year, monthIndex) => {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { from: iso(from), to: iso(to) };
};

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const truncate = (text, max = 120) => {
  const value = String(text || "").trim();
  if (!value) return "—";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
};

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const extractApiError = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const first = err?.response?.data?.data ?? err?.response?.data;
  if (first && typeof first === "object") {
    const firstValue = Object.values(first)[0];
    if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
    if (typeof firstValue === "string" && firstValue.trim()) return firstValue;
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
};

const CallsDeskPage = () => {
  const now = new Date();
  const [assignedToFilter, setAssignedToFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [users, setUsers] = useState({ results: [] });
  const [companies, setCompanies] = useState({ results: [] });
  const [stages, setStages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [calendar, setCalendar] = useState({ total: 0, days: [] });
  const [calendarMonth, setCalendarMonth] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const [selectedDay, setSelectedDay] = useState("");
  const [dayCalls, setDayCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickEditDeal, setQuickEditDeal] = useState(null);
  const [logCallDeal, setLogCallDeal] = useState(null);
  const [detailCall, setDetailCall] = useState(null);
  const [movingDealId, setMovingDealId] = useState(null);

  const loadMeta = useCallback(async () => {
    const [usersData, companiesData, stagesData] = await Promise.all([
      fetchUsers({ page_size: 200, is_active: true }),
      fetchAllPages(fetchCompanies, {}, 200),
      fetchAllPages(fetchPipelineStages, {}, 200),
    ]);
    setUsers(usersData || { results: [] });
    setCompanies(companiesData || { results: [] });
    setStages(
      (stagesData?.results || [])
        .map((stage) => ({ id: stage.key, title: stage.name, dbId: stage.id }))
        .sort((a, b) => String(a.title).localeCompare(String(b.title))),
    );
    return usersData || { results: [] };
  }, []);

  const loadDeals = useCallback(async (userRows = []) => {
    const params = { stage: CALL_STAGE_KEY };
    if (assignedToFilter) params.assigned_to = assignedToFilter;
    if (sourceFilter) params.source = sourceFilter;
    const data = await fetchAllPages(fetchDeals, params, 100);
    const userMap = new Map(userRows.map((user) => [user.id, resolveUserDisplayName(user)]));
    setDeals(
      (data.results || []).map((deal) => ({
        ...deal,
        assigned_to_name: deal.assigned_to_name || userMap.get(deal.assigned_to) || "",
      })),
    );
  }, [assignedToFilter, sourceFilter]);

  const loadCalendar = useCallback(async () => {
    const { from, to } = monthBounds(calendarMonth.year, calendarMonth.month);
    const data = await fetchDealCallsCalendar({ from, to });
    setCalendar({
      total: Number(data?.total || 0),
      days: Array.isArray(data?.days) ? data.days : [],
    });
  }, [calendarMonth.month, calendarMonth.year]);

  const loadRecentCalls = useCallback(async () => {
    const data = await fetchAllDealCalls({ page_size: 50, ordering: "-called_at" });
    setRecentCalls(data?.results || []);
  }, []);

  const loadDayCalls = useCallback(async (day) => {
    if (!day) {
      setDayCalls([]);
      return;
    }
    const data = await fetchAllDealCalls({ page_size: 200, ordering: "-called_at" });
    const rows = (data?.results || []).filter((call) => {
      if (!call.called_at) return false;
      return String(call.called_at).slice(0, 10) === day;
    });
    setDayCalls(rows);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const usersData = await loadMeta();
      await Promise.all([
        loadDeals(usersData.results || []),
        loadCalendar(),
        loadRecentCalls(),
      ]);
      setError("");
    } catch (err) {
      setError(extractApiError(err, "No se pudo cargar el escritorio de llamadas."));
    } finally {
      setLoading(false);
    }
  }, [loadCalendar, loadDeals, loadMeta, loadRecentCalls]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedDay) {
      setDayCalls([]);
      return;
    }
    loadDayCalls(selectedDay).catch((err) => {
      setError(extractApiError(err, "No se pudieron cargar las llamadas del día."));
    });
  }, [loadDayCalls, selectedDay]);

  const visibleDeals = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    if (!q) return deals;
    return deals.filter((deal) => {
      const haystack = [
        deal.title,
        deal.contact_name,
        deal.company_name,
        deal.assigned_to_name,
        deal.business_notes,
        deal.source,
      ]
        .filter(Boolean)
        .map((value) => normalizeSearchText(value))
        .join(" ");
      return haystack.includes(q);
    });
  }, [deals, searchQuery]);

  useEffect(() => {
    setQueuePage(1);
  }, [searchQuery, assignedToFilter, sourceFilter, deals.length]);

  const queueTotalPages = Math.max(1, Math.ceil(visibleDeals.length / QUEUE_PAGE_SIZE));
  const safeQueuePage = Math.min(queuePage, queueTotalPages);
  const pagedDeals = visibleDeals.slice(
    (safeQueuePage - 1) * QUEUE_PAGE_SIZE,
    safeQueuePage * QUEUE_PAGE_SIZE,
  );

  const countsByDate = useMemo(() => {
    const map = new Map();
    (calendar.days || []).forEach((row) => {
      if (row?.date) map.set(row.date, Number(row.count || 0));
    });
    return map;
  }, [calendar.days]);

  const calendarCells = useMemo(() => {
    const first = new Date(calendarMonth.year, calendarMonth.month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, date, count: countsByDate.get(date) || 0 });
    }
    return cells;
  }, [calendarMonth.month, calendarMonth.year, countsByDate]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(
        new Date(calendarMonth.year, calendarMonth.month, 1),
      ),
    [calendarMonth.month, calendarMonth.year],
  );

  const shiftMonth = (delta) => {
    setCalendarMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    setSelectedDay("");
    setDayCalls([]);
  };

  const handleSelectDay = (date) => {
    setSelectedDay(date);
  };

  const handleCallLogged = async (_call, deal) => {
    if (deal?.id) {
      if (deal.stage && deal.stage !== CALL_STAGE_KEY) {
        handleDealSaved(deal);
      } else {
        setDeals((prev) =>
          prev.map((row) =>
            row.id === deal.id ? { ...row, calls_count: Number(row.calls_count || 0) + 1 } : row,
          ),
        );
      }
    }
    try {
      await Promise.all([
        loadCalendar(),
        loadRecentCalls(),
        selectedDay ? loadDayCalls(selectedDay) : Promise.resolve(),
      ]);
    } catch {
      /* ignore refresh errors */
    }
  };

  const handleDealSaved = (updated) => {
    if (!updated?.id) {
      loadDeals(users.results || []);
      return;
    }
    if (updated.stage && updated.stage !== CALL_STAGE_KEY) {
      setDeals((prev) => prev.filter((deal) => deal.id !== updated.id));
      return;
    }
    const userMap = new Map((users.results || []).map((user) => [user.id, resolveUserDisplayName(user)]));
    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === updated.id
          ? {
              ...deal,
              ...updated,
              assigned_to_name: updated.assigned_to_name || userMap.get(updated.assigned_to) || deal.assigned_to_name,
            }
          : deal,
      ),
    );
  };

  const handleQuickMove = async (deal, toStage) => {
    if (!deal?.id || !toStage) return;
    setMovingDealId(deal.id);
    setError("");
    try {
      const updated = await moveDealStage(deal.id, {
        to_stage: toStage,
        notes: `Movido desde escritorio de llamadas → ${toStage}`,
      });
      handleDealSaved(updated || { ...deal, stage: toStage });
    } catch (err) {
      setError(extractApiError(err, "No se pudo mover el lead a la etapa seleccionada."));
    } finally {
      setMovingDealId(null);
    }
  };

  const stageLabelByKey = useMemo(
    () => Object.fromEntries((stages || []).map((stage) => [stage.id, stage.title])),
    [stages],
  );

  if (loading && !deals.length && !recentCalls.length) {
    return (
      <div className="crm-pipeline-page">
        <div className="crm-pipeline-skeleton crm-pipeline-skeleton-header" />
        <div className="crm-pipeline-skeleton crm-pipeline-skeleton-toolbar" />
      </div>
    );
  }

  return (
    <div className="crm-pipeline-page">
      <div className="crm-pipeline-breadcrumb">
        <Link to="/crm" className="crm-pipeline-breadcrumb-link">CRM</Link>
        <i className="bi bi-chevron-right" />
        <span>Escritorio de llamadas</span>
      </div>

      <div className="crm-pipeline-header">
        <div className="crm-pipeline-header-copy">
          <h1>Escritorio de llamadas</h1>
          <p>Deals en etapa &quot;Realizar llamada&quot;, registro de llamadas y calendario del mes.</p>
        </div>
        <div className="crm-pipeline-header-actions">
          <button type="button" className="crm-header-btn" onClick={refreshAll}>
            <i className="bi bi-arrow-repeat" />
            Recargar
          </button>
        </div>
      </div>

      <div className="crm-pipeline-toolbar">
        <div className="crm-toolbar-filters">
          <div className="crm-toolbar-filter">
            <span>Asignado</span>
            <Form.Select size="sm" value={assignedToFilter} onChange={(e) => setAssignedToFilter(e.target.value)}>
              <option value="">Todos</option>
              {(users.results || []).map((user) => (
                <option key={user.id} value={user.id}>{resolveUserDisplayName(user)}</option>
              ))}
            </Form.Select>
          </div>
          <div className="crm-toolbar-filter">
            <span>Origen</span>
            <Form.Select size="sm" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              {DEAL_SOURCES.map(([value, label]) => (
                <option key={value || "all"} value={value}>{label}</option>
              ))}
            </Form.Select>
          </div>
        </div>
        <div className="crm-toolbar-summary">
          <div className="crm-toolbar-summary-block">
            <strong>{visibleDeals.length}</strong>
            <span>por llamar</span>
          </div>
          <div className="crm-toolbar-summary-divider" />
          <div className="crm-toolbar-summary-block">
            <strong>{calendar.total}</strong>
            <span>llamadas del mes</span>
          </div>
        </div>
      </div>

      {error ? <Alert variant="danger" className="py-2 small mb-3">{error}</Alert> : null}

      <div className="row g-3 mb-4">
        <div className="col-xl-7">
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
              <strong>Cola de llamadas</strong>
              <div className="crm-toolbar-search crm-queue-search">
                <i className="bi bi-search" />
                <input
                  type="text"
                  placeholder="Buscar contacto, deal o asignado"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar en la cola de llamadas"
                />
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              <div className="crm-pipeline-table-wrap">
                <Table responsive className="crm-pipeline-table mb-0">
                  <thead>
                    <tr>
                      <th>Contacto</th>
                      <th>Deal</th>
                      <th>Asignado</th>
                      <th>Llamadas</th>
                      <th>Notas comerciales</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDeals.map((deal) => (
                      <tr key={deal.id}>
                        <td>{deal.contact_name || "—"}</td>
                        <td><div className="crm-table-title">{deal.title || "Sin título"}</div></td>
                        <td>{deal.assigned_to_name || "Sin asignar"}</td>
                        <td>
                          <span className="crm-deal-card-calls-badge">
                            <i className="bi bi-telephone-fill" />
                            {Number(deal.calls_count || 0)}
                          </span>
                        </td>
                        <td className="small text-muted">{truncate(deal.business_notes, 90)}</td>
                        <td>
                          <div className="crm-table-actions flex-wrap">
                            <Button size="sm" variant="outline-warning" onClick={() => setLogCallDeal(deal)}>
                              Registrar llamada
                            </Button>
                            {QUICK_OUTCOMES.map((outcome) => (
                              <Button
                                key={outcome.stage}
                                size="sm"
                                variant={outcome.variant}
                                disabled={movingDealId === deal.id}
                                onClick={() => handleQuickMove(deal, outcome.stage)}
                                title={`Mover a ${stageLabelByKey[outcome.stage] || outcome.label}`}
                              >
                                {movingDealId === deal.id ? "..." : outcome.label}
                              </Button>
                            ))}
                            <Button size="sm" variant="outline-primary" onClick={() => setQuickEditDeal(deal)}>
                              Editar
                            </Button>
                            <Button as={Link} to={`/chat/deal/${deal.id}`} size="sm" variant="outline-success">
                              Chat
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!visibleDeals.length ? (
                      <tr>
                        <td colSpan={6} className="text-muted text-center py-5">
                          No hay deals en etapa &quot;Realizar llamada&quot; con los filtros actuales.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </Table>
              </div>
              {visibleDeals.length ? (
                <div className="crm-queue-pagination">
                  <span className="small text-muted">
                    {((safeQueuePage - 1) * QUEUE_PAGE_SIZE) + 1}–{Math.min(safeQueuePage * QUEUE_PAGE_SIZE, visibleDeals.length)} de {visibleDeals.length}
                  </span>
                  <div className="d-flex gap-2 align-items-center">
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={safeQueuePage <= 1}
                      onClick={() => setQueuePage((page) => Math.max(1, page - 1))}
                    >
                      Anterior
                    </Button>
                    <span className="small">Página {safeQueuePage} de {queueTotalPages}</span>
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      disabled={safeQueuePage >= queueTotalPages}
                      onClick={() => setQueuePage((page) => Math.min(queueTotalPages, page + 1))}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </Card.Body>
          </Card>
        </div>

        <div className="col-xl-5">
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center">
              <strong>Calendario de llamadas</strong>
              <div className="d-flex align-items-center gap-2">
                <Button size="sm" variant="outline-secondary" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
                  <i className="bi bi-chevron-left" />
                </Button>
                <span className="small text-capitalize">{monthLabel}</span>
                <Button size="sm" variant="outline-secondary" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
                  <i className="bi bi-chevron-right" />
                </Button>
              </div>
            </Card.Header>
            <Card.Body className="crm-calls-calendar-body">
              <div className="crm-calls-calendar-grid mb-3">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((label) => (
                  <div key={label} className="crm-calls-calendar-weekday">{label}</div>
                ))}
                {calendarCells.map((cell, index) =>
                  cell ? (
                    <button
                      key={cell.date}
                      type="button"
                      className={`crm-calls-calendar-day ${selectedDay === cell.date ? "is-selected" : ""} ${cell.count ? "has-calls" : ""}`}
                      onClick={() => handleSelectDay(cell.date)}
                    >
                      <span>{cell.day}</span>
                      {cell.count > 0 ? <em>{cell.count}</em> : null}
                    </button>
                  ) : (
                    <div key={`pad-${index}`} className="crm-calls-calendar-day is-empty" />
                  ),
                )}
              </div>
              <div className="crm-calls-day-summary">
                Total del mes: <strong>{calendar.total}</strong>
                {selectedDay ? (
                  <>
                    {" "}
                    · Día seleccionado:{" "}
                    <strong>
                      {new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date(`${selectedDay}T00:00:00`))}
                    </strong>
                  </>
                ) : null}
              </div>
              {selectedDay ? (
                <div className="crm-calls-day-list">
                  {dayCalls.length ? (
                    dayCalls.map((call) => (
                      <button
                        key={call.id}
                        type="button"
                        className={`crm-calls-day-item ${detailCall?.id === call.id ? "is-active" : ""}`}
                        onClick={() => setDetailCall(call)}
                      >
                        <div className="crm-calls-day-item-topline">
                          <strong>{call.deal_title || "Deal"}</strong>
                          <span>{formatDateTime(call.called_at)}</span>
                        </div>
                        <p>{truncate(call.notes, 220)}</p>
                      </button>
                    ))
                  ) : (
                    <div className="text-muted py-3">Sin llamadas registradas este día.</div>
                  )}
                </div>
              ) : (
                <div className="text-muted">Haz clic en un día para ver las llamadas.</div>
              )}
            </Card.Body>
          </Card>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <Card.Header className="bg-white">
          <strong>Llamadas recientes</strong>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="crm-pipeline-table-wrap">
            <Table responsive className="crm-pipeline-table mb-0">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Deal</th>
                  <th>Contacto</th>
                  <th>Registró</th>
                  <th>Notas</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id}>
                    <td>{formatDateTime(call.called_at)}</td>
                    <td>
                      <Link to={`/crm/deals/${call.deal}`}>{call.deal_title || "Ver deal"}</Link>
                    </td>
                    <td>{call.contact_name || "—"}</td>
                    <td>{call.created_by_name || "—"}</td>
                    <td className="small">{truncate(call.notes, 100)}</td>
                    <td>
                      <Button size="sm" variant="outline-secondary" onClick={() => setDetailCall(call)}>
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
                {!recentCalls.length ? (
                  <tr>
                    <td colSpan={6} className="text-muted text-center py-4">Aún no hay llamadas registradas.</td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>

      <QuickEditDealModal
        show={Boolean(quickEditDeal)}
        deal={quickEditDeal}
        users={users.results || []}
        companies={companies.results || []}
        stages={stages}
        onHide={() => setQuickEditDeal(null)}
        onSaved={handleDealSaved}
      />

      <LogDealCallModal
        show={Boolean(logCallDeal)}
        deal={logCallDeal}
        stages={stages}
        onHide={() => setLogCallDeal(null)}
        onLogged={handleCallLogged}
      />

      <Modal show={Boolean(detailCall)} onHide={() => setDetailCall(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Detalle de llamada</Modal.Title>
        </Modal.Header>
        <Modal.Body className="d-grid gap-2">
          <div><strong>Deal:</strong> {detailCall?.deal_title || "—"}</div>
          <div><strong>Contacto:</strong> {detailCall?.contact_name || "—"}</div>
          <div><strong>Fecha:</strong> {formatDateTime(detailCall?.called_at)}</div>
          <div><strong>Registró:</strong> {detailCall?.created_by_name || "—"}</div>
          <div>
            <strong>Notas</strong>
            <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}>{detailCall?.notes || "—"}</div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          {detailCall?.deal ? (
            <Button as={Link} to={`/crm/deals/${detailCall.deal}`} variant="outline-primary">
              Ver deal
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => setDetailCall(null)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CallsDeskPage;
