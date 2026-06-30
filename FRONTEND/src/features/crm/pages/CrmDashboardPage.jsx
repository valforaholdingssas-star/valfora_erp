import { useEffect, useMemo, useState } from "react";
import { Button, Form, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchCompanies, fetchCrmDashboard } from "../../../api/crm.js";
import { formatDealValue } from "../utils/formatters.js";

const STAGE_META = {
  new_lead: { label: "New lead", tone: "new" },
  contacted: { label: "Contactado", tone: "contacted" },
  qualified: { label: "Calificado", tone: "qualified" },
  proposal: { label: "Propuesta", tone: "proposal" },
  negotiation: { label: "Negociacion", tone: "negotiation" },
  won: { label: "Ganado", tone: "won" },
  lost: { label: "Perdido", tone: "lost" },
};

const prettifyStage = (value) => {
  const meta = STAGE_META[String(value || "").toLowerCase()];
  if (meta) return meta.label;
  return String(value || "Sin etapa").replaceAll("_", " ");
};

const toneForStage = (value) => STAGE_META[String(value || "").toLowerCase()]?.tone || "neutral";

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const CrmDashboardPage = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState({ results: [] });
  const [companyFilter, setCompanyFilter] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetchCompanies({ page_size: 200 }).then(setCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchCrmDashboard(companyFilter ? { company: companyFilter } : undefined)
      .then(setData)
      .catch(() => setError("No se pudo cargar el dashboard CRM."))
      .finally(() => setLoading(false));
  }, [companyFilter, refreshTick]);

  const summary = data?.summary || {};
  const stageEntries = useMemo(
    () => Object.entries(data?.pipeline_by_stage || {}),
    [data?.pipeline_by_stage],
  );
  const byCompany = data?.by_company || [];
  const recent = data?.recent_activities || [];
  const totalActiveValue = summary.active_value || 0;
  const conversionRate = summary.total_count ? ((summary.won_count || 0) / summary.total_count) * 100 : 0;
  const lostRate = summary.total_count ? ((summary.lost_count || 0) / summary.total_count) * 100 : 0;

  return (
    <div className="crm-dashboard-page">
      <section className="crm-hero-card">
        <div>
          <div className="crm-breadcrumb">
            <span>CRM</span>
            <i className="bi bi-chevron-right" />
            <span>Dashboard CRM</span>
          </div>
          <h1>Dashboard CRM</h1>
          <p>Rendimiento del pipeline, distribucion comercial y actividad reciente.</p>
        </div>
        <div className="crm-toolbar">
          <div className="crm-toolbar-field">
            <span>Empresa:</span>
            <Form.Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="">Todas</option>
              {(companies.results || []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </Form.Select>
          </div>
          <Button variant="light" className="crm-icon-button" onClick={() => setRefreshTick((prev) => prev + 1)}>
            <i className="bi bi-arrow-clockwise" />
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="crm-empty-state">
          <Spinner animation="border" />
        </div>
      ) : error ? (
        <div className="crm-empty-state text-danger">{error}</div>
      ) : (
        <>
          <section className="crm-kpi-grid">
            <article className="crm-kpi-card crm-kpi-card-primary">
              <div className="crm-kpi-head">
                <span className="crm-kpi-icon">
                  <i className="bi bi-activity" />
                </span>
                <span>Pipeline consolidado</span>
              </div>
              <strong>{summary.active_count || 0}</strong>
              <small>deals activos</small>
              <div className="crm-kpi-meta">
                <span>{formatDealValue(totalActiveValue)}</span>
                <span>valor en pipeline</span>
              </div>
            </article>

            <article className="crm-kpi-card">
              <div className="crm-kpi-head">
                <span className="crm-kpi-icon crm-kpi-icon-navy">
                  <i className="bi bi-briefcase" />
                </span>
                <span>Total negocios</span>
              </div>
              <strong>{summary.total_count || 0}</strong>
              <small>incluye abiertos y cerrados</small>
              <div className="crm-kpi-footer">
                <i className="bi bi-graph-up-arrow" />
                <span>pipeline total visible</span>
              </div>
            </article>

            <article className="crm-kpi-card">
              <div className="crm-kpi-head">
                <span className="crm-kpi-icon crm-kpi-icon-success">
                  <i className="bi bi-trophy" />
                </span>
                <span>Ganados</span>
              </div>
              <strong>{summary.won_count || 0}</strong>
              <small>deals convertidos</small>
              <div className="crm-progress-meta">
                <div className="crm-progress-label">
                  <span>Tasa de conversion</span>
                  <span>{conversionRate.toFixed(1)}%</span>
                </div>
                <div className="crm-progress-bar">
                  <span style={{ width: `${Math.min(conversionRate, 100)}%` }} />
                </div>
              </div>
            </article>

            <article className="crm-kpi-card">
              <div className="crm-kpi-head">
                <span className="crm-kpi-icon crm-kpi-icon-danger">
                  <i className="bi bi-x-circle" />
                </span>
                <span>Perdidos</span>
              </div>
              <strong>{summary.lost_count || 0}</strong>
              <small>deals cerrados sin conversion</small>
              <div className="crm-progress-meta">
                <div className="crm-progress-label">
                  <span>Tasa de perdida</span>
                  <span>{lostRate.toFixed(1)}%</span>
                </div>
                <div className="crm-progress-bar crm-progress-bar-danger">
                  <span style={{ width: `${Math.min(lostRate, 100)}%` }} />
                </div>
              </div>
            </article>
          </section>

          <section className="crm-panel">
            <div className="crm-panel-head">
              <div>
                <h2>Desglose por etapa</h2>
                <p>Distribucion actual de los negocios activos dentro del pipeline.</p>
              </div>
              <Link to="/crm/pipeline" className="crm-inline-link">
                Ver pipeline <i className="bi bi-arrow-right" />
              </Link>
            </div>

            <div className="crm-stage-rail">
              {stageEntries.map(([stage, info]) => {
                const percent = totalActiveValue > 0 ? Math.max((info.value / totalActiveValue) * 100, 6) : 6;
                return (
                  <span
                    key={stage}
                    className={`crm-stage-rail-segment crm-stage-rail-${toneForStage(stage)}`}
                    style={{ flexGrow: Math.max(info.count || 1, 1), flexBasis: `${percent}%` }}
                  />
                );
              })}
            </div>

            <div className="crm-stage-grid">
              {stageEntries.map(([stage, info]) => {
                const width = totalActiveValue > 0 ? Math.min((info.value / totalActiveValue) * 100, 100) : 0;
                return (
                  <article key={stage} className="crm-stage-card">
                    <div className="crm-stage-card-top">
                      <div className="crm-stage-title">
                        <span className={`crm-stage-dot crm-stage-dot-${toneForStage(stage)}`} />
                        <span>{prettifyStage(stage)}</span>
                      </div>
                      <span className={`crm-stage-count crm-stage-count-${toneForStage(stage)}`}>{info.count || 0}</span>
                    </div>
                    <strong>{formatDealValue(info.value)}</strong>
                    <small>valor acumulado</small>
                    <div className="crm-stage-card-bar">
                      <span className={`crm-stage-card-bar-fill crm-stage-card-bar-fill-${toneForStage(stage)}`} style={{ width: `${Math.max(width, width > 0 ? 6 : 0)}%` }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {!companyFilter && (
            <section className="crm-panel">
              <div className="crm-panel-head">
                <div>
                  <h2>Deals por empresa</h2>
                  <p>Lectura consolidada del pipeline por cliente.</p>
                </div>
              </div>
              <div className="crm-data-table-wrap">
                <Table responsive className="crm-data-table crm-dashboard-company-table mb-0">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Deals</th>
                      <th>Valor total</th>
                      <th>Distribucion por etapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCompany.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-4">
                          Sin datos por empresa todavia.
                        </td>
                      </tr>
                    ) : (
                      byCompany.map((row) => (
                        <tr key={row.company_id || "none"}>
                          <td>
                            <div className="crm-company-cell">
                              <span className="crm-company-avatar">{(row.company_name || "S").slice(0, 1).toUpperCase()}</span>
                              <div>
                                <strong>{row.company_name || "Sin empresa"}</strong>
                                <small>{row.company_id ? "cliente registrado" : "sin asignacion"}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="crm-count-pill">{row.count || 0}</span>
                          </td>
                          <td>
                            <div className="crm-value-stack">
                              <strong>{formatDealValue(row.value)}</strong>
                              <small>pipeline</small>
                            </div>
                          </td>
                          <td>
                            <div className="crm-chip-row">
                              {Object.entries(row.pipeline_by_stage || {}).map(([stage, info]) => (
                                <span key={`${row.company_id || "none"}-${stage}`} className={`crm-mini-chip crm-mini-chip-${toneForStage(stage)}`}>
                                  {prettifyStage(stage)}: {info.count}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            </section>
          )}

          <section className="crm-panel">
            <div className="crm-panel-head">
              <div>
                <h2>Actividad reciente</h2>
                <p>Seguimiento operativo sobre tareas y movimientos del CRM.</p>
              </div>
            </div>
            <div className="crm-data-table-wrap">
              <Table responsive className="crm-data-table mb-0">
                <thead>
                  <tr>
                    <th>Asunto</th>
                    <th>Deal</th>
                    <th>Empresa</th>
                    <th>Tipo</th>
                    <th>Contacto</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        Sin actividades recientes.
                      </td>
                    </tr>
                  ) : (
                    recent.map((activity) => (
                      <tr key={activity.id}>
                        <td>
                          <div className="crm-subject-cell">
                            <strong>{activity.subject}</strong>
                            <small>{activity.description || "sin descripcion adicional"}</small>
                          </div>
                        </td>
                        <td>{activity.deal_title || "—"}</td>
                        <td>{activity.company_name || "—"}</td>
                        <td>
                          <span className="crm-neutral-chip">{activity.activity_type || "actividad"}</span>
                        </td>
                        <td>{activity.contact_name || "—"}</td>
                        <td>{formatDateTime(activity.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default CrmDashboardPage;
