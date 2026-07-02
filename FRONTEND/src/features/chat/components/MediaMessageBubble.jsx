import PropTypes from "prop-types";

const ensureAbsoluteUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return `${window.location.origin}${url}`;
  return url;
};

const MediaMessageBubble = ({ message }) => {
  if (!message) return null;

  const firstAttachment = message.attachments?.[0] || null;
  const attachmentUrl = ensureAbsoluteUrl(firstAttachment?.url || message.metadata?.link || null);
  const attachmentName = firstAttachment?.file_name || message.metadata?.attachment_name || "Adjunto";
  const attachmentType = firstAttachment?.file_type || "";

  if (!attachmentUrl) {
    return (
      <div>
        <div className="small text-muted">Adjunto en procesamiento...</div>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
      </div>
    );
  }

  const actionRow = (
    <div className="d-flex gap-2 mt-2">
      <a href={attachmentUrl} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm">
        Ver
      </a>
      <a href={attachmentUrl} download={attachmentName} className="btn btn-outline-secondary btn-sm">
        Descargar
      </a>
    </div>
  );

  if (message.message_type === "image") {
    return (
      <div>
        <a href={attachmentUrl} target="_blank" rel="noreferrer">
          <img src={attachmentUrl} alt={attachmentName} style={{ maxWidth: 240, borderRadius: 8 }} />
        </a>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
        {actionRow}
      </div>
    );
  }

  if (message.message_type === "audio" || attachmentType.startsWith("audio/")) {
    return (
      <div>
        <audio controls preload="metadata" style={{ maxWidth: 320 }}>
          <source src={attachmentUrl} type={attachmentType || "audio/mpeg"} />
          Tu navegador no soporta audio embebido.
        </audio>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
        {actionRow}
      </div>
    );
  }

  if (message.message_type === "video" || attachmentType.startsWith("video/")) {
    return (
      <div>
        <video controls preload="metadata" style={{ maxWidth: 320, borderRadius: 8 }}>
          <source src={attachmentUrl} type={attachmentType || "video/mp4"} />
          Tu navegador no soporta video embebido.
        </video>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
        {actionRow}
      </div>
    );
  }

  if (message.message_type === "document") {
    return (
      <div>
        <div>
          <i className="bi bi-file-earmark-text me-1" />
          <a href={attachmentUrl} target="_blank" rel="noreferrer">{attachmentName}</a>
        </div>
        {message.content ? <div className="small mt-1">{message.content}</div> : null}
        {actionRow}
      </div>
    );
  }

  return (
    <div>
      <span>{message.content}</span>
      {actionRow}
    </div>
  );
};

MediaMessageBubble.propTypes = {
  message: PropTypes.object,
};

export default MediaMessageBubble;
