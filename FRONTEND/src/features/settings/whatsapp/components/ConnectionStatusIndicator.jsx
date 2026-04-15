import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const ConnectionStatusIndicator = ({ ok }) => {
  if (ok === null || ok === undefined) {
    return <Badge bg="secondary">Verificando...</Badge>;
  }
  return <Badge bg={ok ? "success" : "danger"}>{ok ? "Conectado" : "Sin conexión"}</Badge>;
};

ConnectionStatusIndicator.propTypes = {
  ok: PropTypes.oneOfType([PropTypes.bool, PropTypes.oneOf([null])]),
};

export default ConnectionStatusIndicator;
