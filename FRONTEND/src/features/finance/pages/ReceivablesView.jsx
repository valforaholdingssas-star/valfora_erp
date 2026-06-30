import { useEffect, useState } from "react";
import { Form, Spinner, Table } from "react-bootstrap";

import { fetchReceivables } from "../../../api/finance.js";

const ReceivablesView = () => {
  const [data, setData] = useState({ results: [], metrics: {} });
  const [loading, setLoading] = useState(true);
  const [aging, setAging] = useState("");

  const load = () => {
    setLoading(true);
    fetchReceivables({ aging: aging || undefined })
      .then(setData)
      .catch(() => setData({ results: [], metrics: {} }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aging]);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Cartera</h1>
          <p className="text-muted mb-0">Controla saldos pendientes, vencimientos y distribución por antigüedad.</p>
        </div>
      </div>
      <div className="app-kpi-grid mb-4">
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Por cobrar</span>
          <div className="app-kpi-value">{data.metrics?.total_receivable || 0}</div>
          <p className="text-muted mb-0">Saldo total</p>
        </article>
        <article className="app-kpi-tile">
          <span className="app-eyebrow">Vencido</span>
          <div className="app-kpi-value">{data.metrics?.total_overdue || 0}</div>
          <p className="text-muted mb-0">Monto fuera de fecha</p>
        </article>
      </div>
      <div className="app-surface app-surface-padded mb-4">
        <div className="app-filterbar">
          <div className="app-filter-field">
            <span>Rango de antigüedad</span>
            <Form.Select
              size="sm"
              value={aging}
              onChange={(e) => setAging(e.target.value)}
            >
              <option value="">Todas las edades</option>
              <option value="0_30">0-30 días</option>
              <option value="31_60">31-60 días</option>
              <option value="61_90">61-90 días</option>
              <option value="90_plus">90+ días</option>
            </Form.Select>
          </div>
        </div>
      </div>
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <div className="app-surface app-surface-padded">
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Detalle</div>
              <h2 className="h6 mb-0">Facturas en cartera</h2>
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
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  <th>Días vencido</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {(data.results || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.invoice_number}</td>
                    <td>{row.contact}</td>
                    <td>{row.contract_number || "—"}</td>
                    <td>{row.total_amount}</td>
                    <td>{row.amount_paid}</td>
                    <td>{row.balance_due}</td>
                    <td>{row.days_overdue}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceivablesView;
