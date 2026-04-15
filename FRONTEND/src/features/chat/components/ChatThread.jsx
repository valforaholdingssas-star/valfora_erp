import PropTypes from "prop-types";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Spinner } from "react-bootstrap";

import MediaMessageBubble from "./MediaMessageBubble.jsx";
import MessageStatusTicks from "./MessageStatusTicks.jsx";
import NewMessageBadge from "./NewMessageBadge.jsx";
import ServiceWindowIndicator from "./ServiceWindowIndicator.jsx";

const ChatThread = ({
  loading,
  messages,
  activeConv,
  wsStatus,
  peerTyping,
  aiEnabled,
  clearingHandoff,
  onToggleAi,
  onClearHandoff,
  onRetry,
  senderLabel,
  statusWarning,
}) => {
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const prevMessagesLengthRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNewMessages, setPendingNewMessages] = useState(0);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "end",
    });
  };

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = distance < 40;
    setIsAtBottom(bottom);
    if (bottom) {
      setPendingNewMessages(0);
    }
  };

  useEffect(() => {
    prevMessagesLengthRef.current = 0;
    setPendingNewMessages(0);
    setTimeout(() => {
      scrollToBottom(false);
      setIsAtBottom(true);
    }, 0);
  }, [activeConv?.id]);

  useEffect(() => {
    if (loading) return;
    const prevLen = prevMessagesLengthRef.current;
    const currentLen = messages?.length || 0;
    if (currentLen > prevLen) {
      const delta = currentLen - prevLen;
      if (isAtBottom || prevLen === 0) {
        scrollToBottom(prevLen !== 0);
      } else {
        setPendingNewMessages((prev) => prev + delta);
      }
    }
    prevMessagesLengthRef.current = currentLen;
  }, [messages, isAtBottom, loading]);

  return (
    <>
      {activeConv && (
        <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2 app-chat-topbar">
          <div>
            <strong>{activeConv.contact_name || "Chat"}</strong>
            <span className="text-muted small ms-2 text-capitalize">{activeConv.channel}</span>
            <span
              className={`badge ms-2 ${
                wsStatus === "connected"
                  ? "text-bg-success"
                  : wsStatus === "reconnecting" || wsStatus === "connecting"
                    ? "text-bg-warning"
                    : "text-bg-secondary"
              }`}
            >
              {wsStatus === "connected"
                ? "En línea"
                : wsStatus === "reconnecting" || wsStatus === "connecting"
                  ? "Reconectando..."
                  : "Desconectado"}
            </span>
            {activeConv.channel === "whatsapp" && (
              <span className="ms-2">
                <ServiceWindowIndicator expiresAt={activeConv.customer_service_window_expires} />
              </span>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              id="toggle-ai"
              type="button"
              className={`btn btn-sm ${aiEnabled ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => {
                void onToggleAi();
              }}
            >
              <i className="bi bi-robot me-1" />
              Modo IA
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Llamar">
              <i className="bi bi-telephone" />
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" aria-label="Video">
              <i className="bi bi-camera-video" />
            </button>
          </div>
        </div>
      )}
      {peerTyping && <p className="text-muted small fst-italic mb-2 px-1">Escribiendo…</p>}
      {activeConv?.human_handoff_requested && (
        <Alert variant="warning" className="py-2 small mb-2">
          El contacto solicitó atención humana (o la IA fue bloqueada por políticas).{" "}
          <button
            type="button"
            className="btn btn-outline-dark btn-sm ms-2"
            disabled={clearingHandoff}
            onClick={() => {
              void onClearHandoff();
            }}
          >
            Marcar como atendido
          </button>
        </Alert>
      )}
      <div className="position-relative app-chat-thread-wrap">
        <div
          ref={containerRef}
          className="flex-grow-1 border rounded p-3 mb-2 bg-body-secondary app-chat-log"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={handleScroll}
        >
          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            (messages || []).map((m) => (
              <div
                key={m.id}
                className={`mb-2 small ${m.sender_type === "user" ? "text-end" : ""}`}
              >
                <div className={`mt-1 app-chat-bubble ${m.sender_type === "user" ? "is-agent" : ""}`}>
                  <MediaMessageBubble message={m} />
                  {m.sender_type === "user" && (
                    <span className="d-inline-flex align-items-center">
                      <MessageStatusTicks status={m.status} />
                    </span>
                  )}
                </div>
                <div className={`app-chat-msg-meta ${m.sender_type === "user" ? "justify-content-end" : "justify-content-start"}`}>
                  <span className="app-chat-msg-author">{senderLabel(m)}</span>
                  {m.is_ai_generated && (
                    <Badge bg="info" className="me-1">
                      IA
                    </Badge>
                  )}
                  {statusWarning(m)}
                  {m.status === "failed" && String(m.id).startsWith("temp-") && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 ms-1 align-baseline"
                      onClick={() => {
                        void onRetry(m);
                      }}
                    >
                      Reintentar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        {!isAtBottom && pendingNewMessages > 0 && (
          <NewMessageBadge
            count={pendingNewMessages}
            onClick={() => {
              scrollToBottom(true);
              setPendingNewMessages(0);
            }}
          />
        )}
      </div>
    </>
  );
};

ChatThread.propTypes = {
  loading: PropTypes.bool,
  messages: PropTypes.arrayOf(PropTypes.object),
  activeConv: PropTypes.object,
  wsStatus: PropTypes.string,
  peerTyping: PropTypes.bool,
  aiEnabled: PropTypes.bool,
  clearingHandoff: PropTypes.bool,
  onToggleAi: PropTypes.func.isRequired,
  onClearHandoff: PropTypes.func.isRequired,
  onRetry: PropTypes.func.isRequired,
  senderLabel: PropTypes.func.isRequired,
  statusWarning: PropTypes.func.isRequired,
};

export default ChatThread;
