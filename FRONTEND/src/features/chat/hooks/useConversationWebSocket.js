import { useEffect, useRef, useState } from "react";

import { getChatWebSocketUrl } from "../../../api/chat.js";

const MAX_RECONNECT_ATTEMPTS = 8;
const MAX_RECONNECT_DELAY_MS = 15000;

export const useConversationWebSocket = ({
  conversationId,
  token,
  onMessageCreated,
  onMessageUpdated,
  onTyping,
}) => {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const [status, setStatus] = useState("disconnected");

  useEffect(() => {
    if (!conversationId || !token) {
      setStatus("disconnected");
      return undefined;
    }

    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;

      const attempt = reconnectAttemptRef.current;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");

      const ws = new WebSocket(getChatWebSocketUrl(conversationId, token));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("connected");
      };

      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.event === "message.created" && payload.message) {
            onMessageCreated?.(payload.message);
            return;
          }
          if (payload.event === "message.updated" && payload.message) {
            onMessageUpdated?.(payload.message);
            return;
          }
          if (payload.event === "typing") {
            onTyping?.(payload);
          }
        } catch {
          /* ignore malformed payloads */
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;

        if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setStatus("disconnected");
          return;
        }
        reconnectAttemptRef.current += 1;
        const delay = Math.min(
          1000 * 2 ** (reconnectAttemptRef.current - 1),
          MAX_RECONNECT_DELAY_MS,
        );
        setStatus("reconnecting");
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        /* onclose handles retries */
      };
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      reconnectAttemptRef.current = 0;
      setStatus("disconnected");
    };
  }, [conversationId, token, onMessageCreated, onMessageUpdated, onTyping]);

  const sendJson = (payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  return {
    status,
    isConnected: status === "connected",
    sendJson,
  };
};

export default useConversationWebSocket;
