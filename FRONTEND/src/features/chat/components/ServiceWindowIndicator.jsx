import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const ServiceWindowIndicator = ({ expiresAt }) => {
  if (!expiresAt) {
    return <Badge bg="secondary">Ventana cerrada · Solo plantillas</Badge>;
  }
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry) || expiry <= now) {
    return <Badge bg="secondary">Ventana cerrada · Solo plantillas</Badge>;
  }
  const diffMs = expiry - now;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return <Badge bg="success">Ventana abierta · {hours}h {mins}m</Badge>;
};

ServiceWindowIndicator.propTypes = {
  expiresAt: PropTypes.string,
};

export default ServiceWindowIndicator;
