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
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Factura {invoice.invoice_number}</h1>
        <Button as={Link} to={`/finance/invoices/${id}/edit`} size="sm" variant="outline-primary">
          Editar
        </Button>
      </div>
      <p><strong>Estado:</strong> <InvoiceStatusBadge status={invoice.status} /></p>
      <p><strong>Emisión:</strong> {invoice.issue_date}</p>
      <p><strong>Vencimiento:</strong> {invoice.due_date}</p>
      <p><strong>Total:</strong> {invoice.total_amount}</p>
      <p><strong>Pagado:</strong> {invoice.amount_paid}</p>
      <p><strong>Saldo:</strong> {invoice.balance_due}</p>

      <h2 className="h6 mt-4">Ítems</h2>
      <Table size="sm" responsive>
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
  );
};

export default InvoiceDetail;
