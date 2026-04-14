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
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Facturas</h1>
        <Button as={Link} to="/finance/invoices/new" size="sm">Nueva factura</Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Table size="sm" responsive hover>
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
      )}
    </div>
  );
};

export default InvoicesList;
