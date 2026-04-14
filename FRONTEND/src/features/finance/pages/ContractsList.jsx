import { useEffect } from "react";
import { Button, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";

import ContractStatusBadge from "../components/ContractStatusBadge.jsx";
import { useContracts } from "../hooks/useContracts.js";

const ContractsList = () => {
  const { data, loading, error, loadContracts } = useContracts();

  useEffect(() => {
    void loadContracts({ page_size: 50 });
  }, [loadContracts]);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h4 mb-0">Contratos</h1>
        <Button as={Link} to="/finance/contracts/new" size="sm">
          Nuevo contrato
        </Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <Table size="sm" responsive hover>
          <thead>
            <tr>
              <th>Número</th>
              <th>Título</th>
              <th>Estado</th>
              <th>Valor</th>
              <th>Inicio</th>
            </tr>
          </thead>
          <tbody>
            {(data.results || []).map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/finance/contracts/${item.id}`}>{item.contract_number}</Link>
                </td>
                <td>{item.title}</td>
                <td><ContractStatusBadge status={item.status} /></td>
                <td>{item.total_value} {item.currency}</td>
                <td>{item.start_date}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};

export default ContractsList;
