import PropTypes from "prop-types";

const MediaMessageBubble = ({ message }) => {
  if (!message) return null;
  const attachmentUrl = message.attachments?.[0]?.url || null;
  const attachmentName = message.attachments?.[0]?.file_name || "Adjunto";
  if (message.message_type === "image") {
    const url = attachmentUrl || message.metadata?.link;
    if (!url) return <span>{message.content || "[Imagen]"}</span>;
    return (
      <div>
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="Imagen" style={{ maxWidth: 240, borderRadius: 8 }} />
        </a>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
      </div>
    );
  }
  if (message.message_type === "document") {
    const url = attachmentUrl || message.metadata?.link;
    return (
      <div>
        <i className="bi bi-file-earmark-text me-1" />
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">{attachmentName}</a>
        ) : (
          <span>{attachmentName}</span>
        )}
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
      </div>
    );
  }
  return <span>{message.content}</span>;
};

MediaMessageBubble.propTypes = {
  message: PropTypes.object,
};

export default MediaMessageBubble;
