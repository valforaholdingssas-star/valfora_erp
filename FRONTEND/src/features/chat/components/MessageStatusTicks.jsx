import PropTypes from "prop-types";

const MessageStatusTicks = ({ status }) => {
  if (status === "sending" || status === "pending") return <span className="small text-muted ms-1">⏳</span>;
  if (status === "sent") return <span className="small text-muted ms-1">✓</span>;
  if (status === "delivered") return <span className="small text-muted ms-1">✓✓</span>;
  if (status === "read") return <span className="small text-primary ms-1">✓✓</span>;
  if (status === "failed" || status === "dead_letter") return <span className="small text-danger ms-1">✗</span>;
  return null;
};

MessageStatusTicks.propTypes = {
  status: PropTypes.string,
};

export default MessageStatusTicks;
