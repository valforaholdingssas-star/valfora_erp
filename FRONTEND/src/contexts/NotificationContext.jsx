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
import { useAuth } from "./AuthContext.jsx";

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const wsRef = useRef(null);

  const refreshUnreadFromApi = useCallback(async () => {
    try {
      const data = await fetchNotifications({ is_read: "false", page_size: 1 });
      setUnreadCount(typeof data.count === "number" ? data.count : 0);
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
      ]);
      const list = listData.results || listData || [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, refreshUnreadFromApi]);

  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    load();
  }, [isAuthenticated, load]);

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
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
    };
  }, [isAuthenticated, user]);

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
      loading,
      reload: load,
      markRead,
      markAllRead,
    }),
    [items, unreadCount, loading, load, markRead, markAllRead],
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
