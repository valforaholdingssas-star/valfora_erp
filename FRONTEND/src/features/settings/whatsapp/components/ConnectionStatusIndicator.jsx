import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const ConnectionStatusIndicator = ({ ok }) => (
  <Badge bg={ok ? "success" : "danger"}>{ok ? "Conectado" : "Sin conexión"}</Badge>
);

ConnectionStatusIndicator.propTypes = {
  ok: PropTypes.bool,
};

export default ConnectionStatusIndicator;
