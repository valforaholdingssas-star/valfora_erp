import { useEffect, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import { fetchContract, fetchInvoices } from "../../../api/finance.js";
import ContractStatusBadge from "../components/ContractStatusBadge.jsx";
import PaymentScheduleTable from "../components/PaymentScheduleTable.jsx";
import { formatMoney } from "../utils/formatters.js";

const ContractDetail = () => {
  const { id } = useParams();
  const [contract, setContract] = useState(null);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    fetchContract(id).then(setContract).catch(() => {});
    fetchInvoices({ contract: id, page_size: 50 })
      .then((data) => setInvoices(data.results || []))
      .catch(() => setInvoices([]));
  }, [id]);

  if (!contract) return <Spinner animation="border" />;

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Contrato {contract.contract_number}</h1>
          <p className="text-muted mb-0">
            Cliente, valor, cronograma de pagos y facturas asociadas a este acuerdo.
          </p>
        </div>
        <div className="d-flex gap-2">
          <Button as={Link} to={`/finance/invoices/new?contract=${id}&contact=${contract.contact || ""}`} size="sm">
            Facturar
          </Button>
          <Button as={Link} to={`/finance/contracts/${id}/edit`} variant="outline-primary" size="sm">
            Editar
          </Button>
        </div>
      </div>
      <div className="app-surface app-surface-padded mb-4">
        <div className="app-detail-stack">
          <div className="app-detail-row"><span>Título</span><strong>{contract.title}</strong></div>
          <div className="app-detail-row"><span>Cliente</span><strong>{contract.contact_name || "—"}</strong></div>
          <div className="app-detail-row"><span>Empresa</span><strong>{contract.company_name || "—"}</strong></div>
          <div className="app-detail-row"><span>Estado</span><strong><ContractStatusBadge status={contract.status} /></strong></div>
          <div className="app-detail-row"><span>Valor</span><strong>{formatMoney(contract.total_value, contract.currency)}</strong></div>
          <div className="app-detail-row"><span>Cobrado</span><strong>{formatMoney(contract.collected_total, contract.currency)}</strong></div>
          <div className="app-detail-row"><span>Saldo cartera</span><strong>{formatMoney(contract.balance_due, contract.currency)}</strong></div>
          <div className="app-detail-row"><span>Inicio</span><strong>{contract.start_date}</strong></div>
          <div className="app-detail-row"><span>Fin</span><strong>{contract.end_date || "—"}</strong></div>
          <div className="app-detail-row"><span>Notas</span><strong>{contract.notes || "—"}</strong></div>
        </div>
      </div>
      <div className="app-surface app-surface-padded mb-4">
        <div className="app-surface-header">
          <div>
            <div className="app-eyebrow">Cobros</div>
            <h2 className="h6 mb-0">Cronograma de pagos</h2>
          </div>
        </div>
        <PaymentScheduleTable schedule={contract.payment_schedule || []} />
      </div>
      <div className="app-surface app-surface-padded">
        <div className="app-surface-header">
          <div>
            <div className="app-eyebrow">Facturación</div>
            <h2 className="h6 mb-0">Facturas del contrato</h2>
          </div>
        </div>
        <ul className="mb-0">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link to={`/finance/invoices/${inv.id}`}>{inv.invoice_number}</Link>
              {" · "}
              {formatMoney(inv.total_amount, inv.currency)}
              {" · saldo "}
              {formatMoney(inv.balance_due, inv.currency)}
            </li>
          ))}
          {!invoices.length ? <li className="text-muted">Aún no hay facturas asociadas.</li> : null}
        </ul>
      </div>
    </div>
  );
};

export default ContractDetail;
