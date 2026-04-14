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
    <div>
      <h1 className="h4 mb-3">Cartera</h1>
      <div className="d-flex gap-3 mb-3">
        <div className="small text-muted">
          Total por cobrar: <strong>{data.metrics?.total_receivable || 0}</strong>
        </div>
        <div className="small text-muted">
          Total vencido: <strong>{data.metrics?.total_overdue || 0}</strong>
        </div>
      </div>
      <Form.Select
        size="sm"
        className="mb-3"
        style={{ maxWidth: "220px" }}
        value={aging}
        onChange={(e) => setAging(e.target.value)}
      >
        <option value="">Todas las edades</option>
        <option value="0_30">0-30 días</option>
        <option value="31_60">31-60 días</option>
        <option value="61_90">61-90 días</option>
        <option value="90_plus">90+ días</option>
      </Form.Select>
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Table size="sm" responsive>
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
      )}
    </div>
  );
};

export default ReceivablesView;
