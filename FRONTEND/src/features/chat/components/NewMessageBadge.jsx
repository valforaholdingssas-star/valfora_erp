import PropTypes from "prop-types";

const NewMessageBadge = ({ onClick, count }) => (
  <button
    type="button"
    className="btn btn-primary btn-sm app-chat-new-msg-badge"
    onClick={onClick}
  >
    <i className="bi bi-arrow-down me-1" />
    Nuevos mensajes{count > 0 ? ` (${count})` : ""}
  </button>
);

NewMessageBadge.propTypes = {
  onClick: PropTypes.func.isRequired,
  count: PropTypes.number,
};

export default NewMessageBadge;
