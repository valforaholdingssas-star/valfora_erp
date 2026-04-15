import PropTypes from "prop-types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  fetchNotifications,
  getUserNotifyWebSocketUrl,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/notifications.js";
import { fetchConversations } from "../api/chat.js";
import { useAuth } from "./AuthContext.jsx";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef(null);
  const audioEnabledRef = useRef(false);
  const didInitChatUnreadRef = useRef(false);
  const previousChatUnreadRef = useRef(0);
  const lastSoundAtRef = useRef(0);

  const playIncomingChatSound = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!audioEnabledRef.current) return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < 1200) return;
    lastSoundAtRef.current = now;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.22);
      oscillator.onended = () => {
        ctx.close().catch(() => {});
      };
    } catch {
      /* ignore */
    }
  }, []);

  const refreshUnreadFromApi = useCallback(async () => {
    try {
      const data = await fetchNotifications({ is_read: "false", page_size: 1 });
      setUnreadCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshChatUnreadFromApi = useCallback(async () => {
    try {
      const data = await fetchConversations({ page_size: 500 });
      const list = data?.results || [];
      const total = list.reduce((acc, conv) => acc + Number(conv?.unread_count || 0), 0);
      setChatUnreadCount(total);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [listData] = await Promise.all([
        fetchNotifications({ page_size: 25 }),
        refreshUnreadFromApi(),
        refreshChatUnreadFromApi(),
      ]);
      const list = listData.results || listData || [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, refreshUnreadFromApi, refreshChatUnreadFromApi]);

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setUnreadCount(0);
      setChatUnreadCount(0);
      didInitChatUnreadRef.current = false;
      previousChatUnreadRef.current = 0;
      return;
    }
    load();
  }, [isAuthenticated, load]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const unlock = () => {
      audioEnabledRef.current = true;
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!didInitChatUnreadRef.current) {
      didInitChatUnreadRef.current = true;
      previousChatUnreadRef.current = chatUnreadCount;
      return;
    }
    if (chatUnreadCount > previousChatUnreadRef.current) {
      playIncomingChatSound();
    }
    previousChatUnreadRef.current = chatUnreadCount;
  }, [chatUnreadCount, isAuthenticated, playIncomingChatSound]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = window.setInterval(() => {
      refreshChatUnreadFromApi().catch(() => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, refreshChatUnreadFromApi]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    const token = localStorage.getItem("seeds_access_token");
    if (!token) return;
    const url = getUserNotifyWebSocketUrl(token);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const payload = JSON.parse(ev.data);
        if (payload.event === "notification.created" && payload.notification) {
          const n = payload.notification;
          setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 50));
          if (!n.is_read) setUnreadCount((c) => c + 1);
          if ((n.notification_type || "").toLowerCase() === "chat_message") {
            playIncomingChatSound();
            refreshChatUnreadFromApi().catch(() => {});
          }
        } else if (payload.event === "conversation.updated") {
          refreshChatUnreadFromApi().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
    };
  }, [isAuthenticated, user, playIncomingChatSound, refreshChatUnreadFromApi]);

  const markRead = useCallback(
    async (id) => {
      await markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      await refreshUnreadFromApi();
    },
    [refreshUnreadFromApi],
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      chatUnreadCount,
      loading,
      reload: load,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, chatUnreadCount, loading, load, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
};
