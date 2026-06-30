import { useEffect, useState } from "react";
import { Button, Spinner } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import { fetchContract } from "../../../api/finance.js";
import ContractStatusBadge from "../components/ContractStatusBadge.jsx";
import PaymentScheduleTable from "../components/PaymentScheduleTable.jsx";

const ContractDetail = () => {
  const { id } = useParams();
  const [contract, setContract] = useState(null);

  useEffect(() => {
    fetchContract(id).then(setContract).catch(() => {});
  }, [id]);

  if (!contract) return <Spinner animation="border" />;

  return (
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Contrato {contract.contract_number}</h1>
          <p className="text-muted mb-0">Consulta resumen contractual, estado vigente y cronograma de pagos asociado.</p>
        </div>
        <Button as={Link} to={`/finance/contracts/${id}/edit`} variant="outline-primary" size="sm">
          Editar
        </Button>
      </div>
      <div className="app-surface app-surface-padded mb-4">
        <div className="app-detail-stack">
          <div className="app-detail-row"><span>Título</span><strong>{contract.title}</strong></div>
          <div className="app-detail-row"><span>Estado</span><strong><ContractStatusBadge status={contract.status} /></strong></div>
          <div className="app-detail-row"><span>Valor</span><strong>{contract.total_value} {contract.currency}</strong></div>
          <div className="app-detail-row"><span>Inicio</span><strong>{contract.start_date}</strong></div>
          <div className="app-detail-row"><span>Fin</span><strong>{contract.end_date || "—"}</strong></div>
          <div className="app-detail-row"><span>Notas</span><strong>{contract.notes || "—"}</strong></div>
        </div>
      </div>
      <div className="app-surface app-surface-padded">
        <div className="app-surface-header">
          <div>
            <div className="app-eyebrow">Cobros</div>
            <h2 className="h6 mb-0">Cronograma de pagos</h2>
          </div>
        </div>
        <PaymentScheduleTable schedule={contract.payment_schedule || []} />
      </div>
    </div>
  );
};

export default ContractDetail;
