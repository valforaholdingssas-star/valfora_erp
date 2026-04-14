import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const MAP = {
  draft: "secondary",
  pending_signature: "warning",
  active: "success",
  completed: "primary",
  cancelled: "dark",
  expired: "danger",
};

const ContractStatusBadge = ({ status }) => (
  <Badge bg={MAP[status] || "secondary"}>{status || "unknown"}</Badge>
);

ContractStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default ContractStatusBadge;
