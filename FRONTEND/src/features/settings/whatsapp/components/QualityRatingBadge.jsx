import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const colorByRating = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
  UNKNOWN: "secondary",
};

const QualityRatingBadge = ({ value }) => (
  <Badge bg={colorByRating[value] || "secondary"}>{value || "UNKNOWN"}</Badge>
);

QualityRatingBadge.propTypes = {
  value: PropTypes.string,
};

export default QualityRatingBadge;
