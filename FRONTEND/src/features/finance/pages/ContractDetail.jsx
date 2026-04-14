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
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Contrato {contract.contract_number}</h1>
        <Button as={Link} to={`/finance/contracts/${id}/edit`} variant="outline-primary" size="sm">
          Editar
        </Button>
      </div>
      <p><strong>Título:</strong> {contract.title}</p>
      <p><strong>Estado:</strong> <ContractStatusBadge status={contract.status} /></p>
      <p><strong>Valor:</strong> {contract.total_value} {contract.currency}</p>
      <p><strong>Inicio:</strong> {contract.start_date}</p>
      <p><strong>Fin:</strong> {contract.end_date || "—"}</p>
      <p><strong>Notas:</strong> {contract.notes || "—"}</p>
      <h2 className="h6 mt-4">Cronograma de pagos</h2>
      <PaymentScheduleTable schedule={contract.payment_schedule || []} />
    </div>
  );
};

export default ContractDetail;
