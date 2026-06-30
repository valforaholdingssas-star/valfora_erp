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
    <div className="app-page">
      <div className="app-page-headline app-hero-headline mb-4">
        <div>
          <div className="app-eyebrow">Finanzas</div>
          <h1 className="h3 mb-1">Contratos</h1>
          <p className="text-muted mb-0">Consulta el portafolio contractual, su estado actual y los montos comprometidos.</p>
        </div>
        <Button as={Link} to="/finance/contracts/new" size="sm">
          Nuevo contrato
        </Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
      {loading ? (
        <Spinner animation="border" />
      ) : (
        <div className="app-surface app-surface-padded">
          <div className="app-surface-header">
            <div>
              <div className="app-eyebrow">Listado</div>
              <h2 className="h6 mb-0">Contratos registrados</h2>
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
          </div>
        </div>
      )}
    </div>
  );
};

export default ContractsList;
