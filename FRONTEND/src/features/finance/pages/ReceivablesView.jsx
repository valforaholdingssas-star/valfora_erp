import { useCallback, useEffect, useState } from "react";
import { Button, Col, Form, Row, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchCashFlow, fetchPortfolio, fetchReceivables } from "../../../api/finance.js";
import AgingChart from "../components/AgingChart.jsx";
import CollectionRateChart from "../components/CollectionRateChart.jsx";
import RevenueChart from "../components/RevenueChart.jsx";
import { formatDate, formatMoney, STATUS_LABELS } from "../utils/formatters.js";

const emptyFilters = {
  aging: "",
  status: "",
  search: "",
  start_date: "",
  end_date: "",
  issue_date_after: "",
  issue_date_before: "",
};

const ReceivablesView = () => {
  const [data, setData] = useState({ results: [], metrics: {}, aging: null });
  const [portfolio, setPortfolio] = useState({ results: [], metrics: {} });
  const [cashFlow, setCashFlow] = useState(null);
  const [period, setPeriod] = useState("year");
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== "" && value != null),
      );
      const [receivables, portfolioData, cashFlowData] = await Promise.all([
        fetchReceivables(params),
        fetchPortfolio(),
        fetchCashFlow({ period }),
      ]);
      setData(receivables || { results: [], metrics: {} });
      setPortfolio(portfolioData || { results: [], metrics: {} });
      setCashFlow(cashFlowData || null);
    } catch {
      setData({ results: [], metrics: {} });
      setPortfolio({ results: [], metrics: {} });
      setCashFlow(null);
    } finally {
      setLoading(false);
    }
  }, [filters, period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Cartera</h1>
          <p className="text-muted mb-0">
            Cuánto te deben, por cliente y por antigüedad, junto a ingresos y facturación del periodo.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button as={Link} to="/finance/invoices/new" size="sm" variant="outline-primary">Nueva factura</Button>
          <Button as={Link} to="/finance/payments/new" size="sm">Registrar pago</Button>
        </div>
      </div>

      <div className="app-kpi-grid mb-4">
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Por cobrar</span>
          <div className="app-kpi-value">{formatMoney(data.metrics?.total_receivable)}</div>
          <p className="text-muted mb-0">Saldo abierto</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Vencido</span>
          <div className="app-kpi-value">{formatMoney(data.metrics?.total_overdue)}</div>
          <p className="text-muted mb-0">Fuera de fecha</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Al día</span>
          <div className="app-kpi-value">{formatMoney(data.metrics?.current_balance)}</div>
          <p className="text-muted mb-0">Aún no vence</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Facturado ({period})</span>
          <div className="app-kpi-value">{formatMoney(cashFlow?.kpis?.invoiced_total)}</div>
          <p className="text-muted mb-0">Emisión del periodo</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Cobrado ({period})</span>
          <div className="app-kpi-value">{formatMoney(cashFlow?.kpis?.collected_total)}</div>
          <p className="text-muted mb-0">Ingresos de cartera</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Clientes con saldo</span>
          <div className="app-kpi-value">{portfolio.metrics?.clients_count || 0}</div>
          <p className="text-muted mb-0">En portafolio</p>
        </article>
      </div>

      <div className="app-surface app-surface-padded mb-4">
        <div className="app-filterbar flex-wrap gap-3">
          <div className="app-filter-field">
            <span>Periodo ingresos/facturación</span>
            <Form.Select size="sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="month">Mes</option>
              <option value="quarter">Trimestre</option>
              <option value="year">Año</option>
            </Form.Select>
          </div>
          <div className="app-filter-field">
            <span>Antigüedad</span>
            <Form.Select size="sm" value={filters.aging} onChange={(e) => setFilters((p) => ({ ...p, aging: e.target.value }))}>
              <option value="">Todas</option>
              <option value="current">Al día</option>
              <option value="0_30">1-30 días</option>
              <option value="31_60">31-60 días</option>
              <option value="61_90">61-90 días</option>
              <option value="90_plus">90+ días</option>
            </Form.Select>
          </div>
          <div className="app-filter-field">
            <span>Estado</span>
            <Form.Select size="sm" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              <option value="">Todos</option>
              <option value="sent">Enviada</option>
              <option value="partially_paid">Pago parcial</option>
              <option value="overdue">Vencida</option>
            </Form.Select>
          </div>
          <div className="app-filter-field">
            <span>Vence desde</span>
            <Form.Control size="sm" type="date" value={filters.start_date} onChange={(e) => setFilters((p) => ({ ...p, start_date: e.target.value }))} />
          </div>
          <div className="app-filter-field">
            <span>Vence hasta</span>
            <Form.Control size="sm" type="date" value={filters.end_date} onChange={(e) => setFilters((p) => ({ ...p, end_date: e.target.value }))} />
          </div>
          <div className="app-filter-field">
            <span>Emitida desde</span>
            <Form.Control size="sm" type="date" value={filters.issue_date_after} onChange={(e) => setFilters((p) => ({ ...p, issue_date_after: e.target.value }))} />
          </div>
          <div className="app-filter-field">
            <span>Emitida hasta</span>
            <Form.Control size="sm" type="date" value={filters.issue_date_before} onChange={(e) => setFilters((p) => ({ ...p, issue_date_before: e.target.value }))} />
          </div>
          <div className="app-filter-field">
            <span>Buscar</span>
            <Form.Control
              size="sm"
              placeholder="Cliente, factura, contrato"
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
            />
          </div>
          <div className="align-self-end">
            <Button size="sm" variant="outline-secondary" onClick={() => setFilters(emptyFilters)}>Limpiar</Button>
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner animation="border" />
      ) : (
        <>
          <Row className="g-3 mb-4">
            <Col lg={4}>
              <section className="app-surface app-surface-padded h-100">
                <div className="app-surface-header"><h2 className="h6 mb-0">Aging de cartera</h2></div>
                <AgingChart aging={data.aging} />
              </section>
            </Col>
            <Col lg={4}>
              <section className="app-surface app-surface-padded h-100">
                <div className="app-surface-header"><h2 className="h6 mb-0">Ingresos mensuales</h2></div>
                <RevenueChart rows={cashFlow?.monthly_income || []} />
              </section>
            </Col>
            <Col lg={4}>
              <section className="app-surface app-surface-padded h-100">
                <div className="app-surface-header"><h2 className="h6 mb-0">Facturado vs cobrado</h2></div>
                <CollectionRateChart
                  invoiced={cashFlow?.billing_vs_collection?.invoiced || 0}
                  collected={cashFlow?.billing_vs_collection?.collected || 0}
                />
                <div className="small text-muted mt-3">
                  Facturación mensual: {(cashFlow?.monthly_billing || []).map((row) => `${row.month}: ${formatMoney(row.value)}`).join(" · ") || "Sin datos"}
                </div>
              </section>
            </Col>
          </Row>

          <div className="app-surface app-surface-padded mb-4">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Por cliente</div>
                <h2 className="h6 mb-0">Estado de cuenta consolidado</h2>
              </div>
            </div>
            <div className="app-table-shell">
              <Table size="sm" responsive className="mb-0 app-table-clean">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Empresa</th>
                    <th>Contratos</th>
                    <th>Valor contratos</th>
                    <th>Facturado</th>
                    <th>Cobrado</th>
                    <th>Saldo</th>
                    <th>Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  {(portfolio.results || []).map((row) => (
                    <tr key={row.contact_id}>
                      <td>{row.contact_name}</td>
                      <td>{row.company_name || "—"}</td>
                      <td>{row.contracts_count}</td>
                      <td>{formatMoney(row.contracts_value)}</td>
                      <td>{formatMoney(row.invoiced_total)}</td>
                      <td>{formatMoney(row.collected_total)}</td>
                      <td><strong>{formatMoney(row.balance_due)}</strong></td>
                      <td>{formatMoney(row.overdue_balance)}</td>
                    </tr>
                  ))}
                  {!(portfolio.results || []).length ? (
                    <tr><td colSpan={8} className="text-center text-muted py-4">Sin clientes en cartera.</td></tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          </div>

          <div className="app-surface app-surface-padded">
            <div className="app-surface-header">
              <div>
                <div className="app-eyebrow">Detalle</div>
                <h2 className="h6 mb-0">Facturas abiertas</h2>
              </div>
              <div className="app-inline-stat">
                <span className="app-inline-stat-label">Registros</span>
                <strong>{(data.results || []).length}</strong>
              </div>
            </div>
            <div className="app-table-shell">
              <Table size="sm" responsive className="mb-0 app-table-clean">
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>Cliente</th>
                    <th>Contrato</th>
                    <th>Emisión</th>
                    <th>Vence</th>
                    <th>Total</th>
                    <th>Pagado</th>
                    <th>Saldo</th>
                    <th>Días</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(data.results || []).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/finance/invoices/${row.id}`}>{row.invoice_number}</Link>
                      </td>
                      <td>{row.contact_name || row.contact}</td>
                      <td>
                        {row.contract_id ? (
                          <Link to={`/finance/contracts/${row.contract_id}`}>{row.contract_number}</Link>
                        ) : "—"}
                      </td>
                      <td>{formatDate(row.issue_date)}</td>
                      <td>{formatDate(row.due_date)}</td>
                      <td>{formatMoney(row.total_amount, row.currency)}</td>
                      <td>{formatMoney(row.amount_paid, row.currency)}</td>
                      <td><strong>{formatMoney(row.balance_due, row.currency)}</strong></td>
                      <td>{row.days_overdue}</td>
                      <td>{STATUS_LABELS[row.status] || row.status}</td>
                      <td>
                        <Button as={Link} to="/finance/payments/new" size="sm" variant="outline-success">
                          Pagar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!(data.results || []).length ? (
                    <tr><td colSpan={11} className="text-center text-muted py-4">No hay facturas abiertas con estos filtros.</td></tr>
                  ) : null}
                </tbody>
              </Table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ReceivablesView;
