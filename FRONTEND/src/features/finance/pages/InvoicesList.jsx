import { useEffect } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import InvoiceStatusBadge from "../components/InvoiceStatusBadge.jsx";
import { useInvoices } from "../hooks/useInvoices.js";

const InvoicesList = () => {
  const { data, loading, error, loadInvoices } = useInvoices();

  useEffect(() => {
    void loadInvoices({ page_size: 50 });
  }, [loadInvoices]);

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Facturas</h1>
          <p className="text-muted mb-0">Revisa emisión, vencimiento y saldo pendiente de cada documento de cobro.</p>
        </div>
        <Button as={Link} to="/finance/invoices/new" size="sm">Nueva factura</Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <div className="app-surface app-surface-padded">
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Cartera</div>
              <h2 className="h6 mb-0">Facturación emitida</h2>
            </div>
            <div className="app-inline-stat">
              <span className="app-inline-stat-label">Total</span>
              <strong>{data.count || (data.results || []).length}</strong>
            </div>
          </div>
          <div className="app-table-shell">
            <Table size="sm" responsive hover className="mb-0 app-table-clean">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Estado</th>
                  <th>Emisión</th>
                  <th>Vence</th>
                  <th>Total</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {(data.results || []).map((item) => (
                  <tr key={item.id}>
                    <td><Link to={`/finance/invoices/${item.id}`}>{item.invoice_number}</Link></td>
                    <td><InvoiceStatusBadge status={item.status} /></td>
                    <td>{item.issue_date}</td>
                    <td>{item.due_date}</td>
                    <td>{item.total_amount}</td>
                    <td>{item.balance_due}</td>
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

export default InvoicesList;
