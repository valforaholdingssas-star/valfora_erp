import { useEffect, useState } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import { fetchInvoice } from "../../../api/finance.js";
import InvoiceStatusBadge from "../components/InvoiceStatusBadge.jsx";

const InvoiceDetail = () => {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    fetchInvoice(id).then(setInvoice).catch(() => {});
  }, [id]);

  if (!invoice) return <Spinner animation="border" />;

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Factura {invoice.invoice_number}</h1>
          <p className="text-muted mb-0">Revisa estado, vencimiento, recaudo y detalle de los items facturados.</p>
        </div>
        <Button as={Link} to={`/finance/invoices/${id}/edit`} size="sm" variant="outline-primary">
          Editar
        </Button>
      </div>
      <div className="app-surface app-surface-padded mb-4">
        <div className="app-detail-stack">
          <div className="app-detail-row"><span>Estado</span><strong><InvoiceStatusBadge status={invoice.status} /></strong></div>
          <div className="app-detail-row"><span>Emisión</span><strong>{invoice.issue_date}</strong></div>
          <div className="app-detail-row"><span>Vencimiento</span><strong>{invoice.due_date}</strong></div>
          <div className="app-detail-row"><span>Total</span><strong>{invoice.total_amount}</strong></div>
          <div className="app-detail-row"><span>Pagado</span><strong>{invoice.amount_paid}</strong></div>
          <div className="app-detail-row"><span>Saldo</span><strong>{invoice.balance_due}</strong></div>
        </div>
      </div>

      <div className="app-surface app-surface-padded">
        <div className="app-surface-header">
          <div>
            <div className="app-eyebrow">Detalle</div>
            <h2 className="h6 mb-0">Ítems facturados</h2>
          </div>
        </div>
        <div className="app-table-shell">
          <Table size="sm" responsive className="mb-0 app-table-clean">
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{item.unit_price}</td>
                  <td>{item.total}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetail;
