import PropTypes from "prop-types";
import { Table } from "react-bootstrap";

const ExpiringContractsTable = ({ rows }) => (
  <Table size="sm" responsive>
    <thead>
      <tr>
        <th>Número</th>
        <th>Título</th>
        <th>Vence</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>
      {(rows || []).map((row) => (
        <tr key={row.id}>
          <td>{row.contract_number}</td>
          <td>{row.title}</td>
          <td>{row.end_date || "—"}</td>
          <td>{row.total_value}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

ExpiringContractsTable.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.object),
};

export default ExpiringContractsTable;
