import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const MAP = {
  draft: "secondary",
  sent: "primary",
  paid: "success",
  partially_paid: "warning",
  overdue: "danger",
  cancelled: "dark",
  void: "dark",
};

const InvoiceStatusBadge = ({ status }) => (
  <Badge bg={MAP[status] || "secondary"}>{status || "unknown"}</Badge>
);

InvoiceStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default InvoiceStatusBadge;
