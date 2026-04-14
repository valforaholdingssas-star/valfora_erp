import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const ContactDaysBadge = ({ days }) => {
  if (days === null || days === undefined) {
    return (
      <Badge bg="secondary" className="ms-1">
        Sin contacto
      </Badge>
    );
  }
  let variant = "success";
  if (days >= 7 && days <= 14) variant = "warning";
  if (days > 14) variant = "danger";
  return (
    <Badge bg={variant} className="ms-1">
      {days}d sin contacto
    </Badge>
  );
};

ContactDaysBadge.propTypes = {
  days: PropTypes.number,
};

export default ContactDaysBadge;
