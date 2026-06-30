import { useEffect, useState } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import { fetchPayments } from "../../../api/finance.js";

const PaymentsList = () => {
  const [data, setData] = useState({ results: [], count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayments({ page_size: 100 })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Pagos</h1>
          <p className="text-muted mb-0">Monitorea recaudos, métodos de pago y trazabilidad de los movimientos registrados.</p>
        </div>
        <Button as={Link} to="/finance/payments/new" size="sm">Registrar pago</Button>
      </div>
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <div className="app-surface app-surface-padded">
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Recaudos</div>
              <h2 className="h6 mb-0">Pagos registrados</h2>
            </div>
            <div className="app-inline-stat">
              <span className="app-inline-stat-label">Total</span>
              <strong>{data.count || (data.results || []).length}</strong>
            </div>
          </div>
          <div className="app-table-shell">
            <Table size="sm" responsive className="mb-0 app-table-clean">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Factura</th>
                  <th>Monto</th>
                  <th>Fecha</th>
                  <th>Método</th>
                </tr>
              </thead>
              <tbody>
                {(data.results || []).map((row) => (
                  <tr key={row.id}>
                    <td>{row.payment_number}</td>
                    <td>{row.invoice}</td>
                    <td>{row.amount}</td>
                    <td>{row.payment_date}</td>
                    <td>{row.payment_method}</td>
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

export default PaymentsList;
