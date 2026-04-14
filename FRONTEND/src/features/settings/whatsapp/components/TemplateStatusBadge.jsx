import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const colorMap = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  paused: "secondary",
  disabled: "dark",
};

const TemplateStatusBadge = ({ status }) => (
  <Badge bg={colorMap[status] || "secondary"}>{status || "unknown"}</Badge>
);

TemplateStatusBadge.propTypes = {
  status: PropTypes.string,
};

export default TemplateStatusBadge;
