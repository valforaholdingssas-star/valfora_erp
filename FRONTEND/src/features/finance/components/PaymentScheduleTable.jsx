import PropTypes from "prop-types";
import { Table } from "react-bootstrap";

const PaymentScheduleTable = ({ schedule }) => (
  <Table size="sm" responsive>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Monto</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>
      {(schedule || []).map((row, idx) => (
        <tr key={`${row.due_date}-${idx}`}>
          <td>{row.due_date || "—"}</td>
          <td>{row.amount ?? "—"}</td>
          <td>{row.description || "—"}</td>
        </tr>
      ))}
    </tbody>
  </Table>
);

PaymentScheduleTable.propTypes = {
  schedule: PropTypes.arrayOf(PropTypes.object),
};

export default PaymentScheduleTable;
