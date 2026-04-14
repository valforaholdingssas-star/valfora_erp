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
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Pagos</h1>
        <Button as={Link} to="/finance/payments/new" size="sm">Registrar pago</Button>
      </div>
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Table size="sm" responsive>
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
      )}
    </div>
  );
};

export default PaymentsList;
