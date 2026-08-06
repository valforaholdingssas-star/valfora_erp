import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { useParams } from "react-router-dom";

import { fetchAiConfigurations } from "../../../api/aiConfig.js";
import {
  clearHandoff,
  createOrOpenConversation,
  fetchGlobalAiMode,
  fetchConversations,
  fetchMessages,
  markRead,
  patchConversation,
  sendMessage,
  sendTemplateMessage,
  setGlobalAiMode,
  toggleAi,
} from "../../../api/chat.js";
import { createDeal, fetchCompanies, fetchDeal, fetchPipelineStages, moveDealStage, updateDeal } from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import { fetchWhatsAppPhoneNumbers } from "../../../api/whatsapp.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";
import { useNotifications } from "../../../contexts/NotificationContext.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import ChatSidebar from "../components/ChatSidebar.jsx";
import TemplateSelector from "../components/TemplateSelector.jsx";
import ChatThread from "../components/ChatThread.jsx";
import useConversationWebSocket from "../hooks/useConversationWebSocket.js";

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeTime = (value) => {
  if (!value) return "Sin registros";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registros";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "Hace menos de 1 min";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays} d`;
};

const computePendingReplySla = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: "none", label: "Sin mensajes", detail: "No aplica SLA" };
  }

  let lastContactMessageAt = null;
  let hasAgentReplyAfter = false;

  for (const message of messages) {
    const sender = message?.sender_type;
    const createdAt = message?.created_at;
    if (!createdAt) continue;
    if (sender === "contact") {
      lastContactMessageAt = createdAt;
      hasAgentReplyAfter = false;
    }
    if (sender === "user" && lastContactMessageAt) {
      hasAgentReplyAfter = true;
    }
  }

  if (!lastContactMessageAt) {
    return { status: "none", label: "Sin mensajes de contacto", detail: "No aplica SLA" };
  }

  if (hasAgentReplyAfter) {
    return {
      status: "ok",
      label: "Al día",
      detail: `Último mensaje de contacto: ${formatRelativeTime(lastContactMessageAt)}`,
    };
  }

  const lastDate = new Date(lastContactMessageAt);
  if (Number.isNaN(lastDate.getTime())) {
    return { status: "none", label: "Sin dato", detail: "Fecha inválida" };
  }
  const diffMin = Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 60000));
  if (diffMin <= 15) {
    return {
      status: "ok",
      label: "En ventana",
      detail: `${diffMin} min sin respuesta`,
    };
  }
  if (diffMin <= 60) {
    return {
      status: "warn",
      label: "Atención",
      detail: `${diffMin} min sin respuesta`,
    };
  }
  return {
    status: "critical",
    label: "Crítico",
    detail: `${diffMin} min sin respuesta`,
  };
};

const computeConversationSla = (conversation) => {
  const inboundRaw = conversation?.last_inbound_message_at;
  if (!inboundRaw) {
    return { status: "none", minutes: 0, label: "Sin inbound", isOverdue: false, awaitingReply: false };
  }
  const inboundAt = new Date(inboundRaw).getTime();
  if (Number.isNaN(inboundAt)) {
    return { status: "none", minutes: 0, label: "Sin dato", isOverdue: false, awaitingReply: false };
  }
  const lastMessageAt = new Date(conversation?.last_message_at || 0).getTime();
  const hasReplyAfterInbound = Number.isFinite(lastMessageAt) && lastMessageAt > inboundAt;
  const awaitingReply = !hasReplyAfterInbound;
  if (hasReplyAfterInbound) {
    return { status: "ok", minutes: 0, label: "Al día", isOverdue: false, awaitingReply: false };
  }
  const diffMin = Math.max(0, Math.floor((Date.now() - inboundAt) / 60000));
  if (diffMin <= 15) {
    return { status: "ok", minutes: diffMin, label: "En ventana", isOverdue: false, awaitingReply };
  }
  if (diffMin <= 60) {
    return { status: "warn", minutes: diffMin, label: "Atención", isOverdue: true, awaitingReply };
  }
  return { status: "critical", minutes: diffMin, label: "Crítico", isOverdue: true, awaitingReply };
};

const computeRemainingWindowLabel = (conversation) => {
  if (conversation?.channel !== "whatsapp" || !conversation?.customer_service_window_expires) return "";
  const expires = new Date(conversation.customer_service_window_expires).getTime();
  if (Number.isNaN(expires)) return "";
  const diff = expires - Date.now();
  if (diff <= 0) return "24h vencidas";
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};

const normalizeMessagesPayload = (payload) => {
  if (Array.isArray(payload)) {
    return { count: payload.length, results: payload };
  }
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const count = Number(payload?.count ?? results.length ?? 0);
  return { count, results };
};

const fetchAllPages = async (fetcher, params = {}, pageSize = 100) => {
  let page = 1;
  let expectedCount = null;
  const results = [];

  while (true) {
    const payload = await fetcher({ ...params, page, page_size: pageSize });
    const rows = payload?.results || [];
    if (expectedCount === null) {
      expectedCount = Number(payload?.count || rows.length || 0);
    }
    results.push(...rows);
    if (!rows.length || results.length >= expectedCount) break;
    page += 1;
  }

  return { count: expectedCount ?? results.length, results };
};

const ChatView = () => {
  const WHATSAPP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  const WHATSAPP_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
  const ALLOWED_WHATSAPP_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
  const ALLOWED_WHATSAPP_DOCUMENT_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/zip",
  ]);

  const { user } = useAuth();
  const { chatEventVersion, lastChatEvent } = useNotifications();
  const { dealId } = useParams();
  const [conversations, setConversations] = useState({ results: [], count: 0 });
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({ results: [], count: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("whatsapp");
  const [filters, setFilters] = useState({
    dealStage: "",
    dealOpenedFrom: "",
    dealOpenedTo: "",
    responsible: "",
  });
  const [conversationStatusFilter, setConversationStatusFilter] = useState("open");
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [companyOptions, setCompanyOptions] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [clearingHandoff, setClearingHandoff] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [aiConfigs, setAiConfigs] = useState([]);
  const [aiConfigId, setAiConfigId] = useState("");
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [messageLoadError, setMessageLoadError] = useState("");
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false);
  const [dealDetail, setDealDetail] = useState(null);
  const [dealDraft, setDealDraft] = useState(null);
  const [loadingDeal, setLoadingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealSaveError, setDealSaveError] = useState("");
  const [dealCreateError, setDealCreateError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSection, setMobileSection] = useState("chat");
  const [quickDealModalOpen, setQuickDealModalOpen] = useState(false);
  const [chatInfoModalOpen, setChatInfoModalOpen] = useState(false);
  const [chatFiltersModalOpen, setChatFiltersModalOpen] = useState(false);
  const [globalAiModeEnabled, setGlobalAiModeEnabled] = useState(false);
  const [globalAiModeLoading, setGlobalAiModeLoading] = useState(false);
  const [whatsAppLines, setWhatsAppLines] = useState([]);
  const [selectedWhatsAppLine, setSelectedWhatsAppLine] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth < 992 : false
  ));
  const typingTimerRef = useRef(null);
  const typingStopRef = useRef(null);
  const conversationsRequestRef = useRef(0);
  const messagesRequestRef = useRef(0);

  const currentUserId = useMemo(() => (user?.id ? String(user.id) : null), [user?.id]);
  const canManageAiConfigs = user && ["admin", "super_admin"].includes(user.role);

  const token = localStorage.getItem("seeds_access_token");

  const dedupeMessagesById = (items) => {
    const seen = new Set();
    const out = [];
    items.forEach((item) => {
      const key = String(item.id);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  };

  const upsertConversationRow = useCallback((incomingConversation) => {
    if (!incomingConversation?.id) return;
    setConversations((prev) => {
      const currentRows = prev?.results || [];
      const withoutIncoming = currentRows.filter((row) => String(row.id) !== String(incomingConversation.id));
      const mergedExisting = currentRows.find((row) => String(row.id) === String(incomingConversation.id));
      const nextRow = mergedExisting ? { ...mergedExisting, ...incomingConversation } : incomingConversation;
      return {
        ...prev,
        count: Math.max(prev?.count || 0, withoutIncoming.length + 1),
        results: [nextRow, ...withoutIncoming],
      };
    });
  }, []);

  const mergeConversationCollections = useCallback((currentRows, incomingRows, options = {}) => {
    const { preserveConversationId = null } = options;
    const orderedRows = [];
    const seen = new Set();

    incomingRows.forEach((row) => {
      if (!row?.id) return;
      const key = String(row.id);
      if (seen.has(key)) return;
      seen.add(key);
      orderedRows.push(row);
    });

    if (preserveConversationId) {
      const preserveKey = String(preserveConversationId);
      if (!seen.has(preserveKey)) {
        const preservedRow = (currentRows || []).find((row) => String(row.id) === preserveKey);
        if (preservedRow) {
          orderedRows.unshift(preservedRow);
        }
      }
    }

    return orderedRows;
  }, []);

  const mergeIncomingMessage = useCallback((prevMessages, incoming) => {
    const list = [...(prevMessages || [])];
    const exactIndex = list.findIndex((msg) => String(msg.id) === String(incoming.id));
    if (exactIndex >= 0) {
      list[exactIndex] = { ...list[exactIndex], ...incoming };
      return dedupeMessagesById(list);
    }

    // If this incoming message is mine, reconcile with a pending local temp message.
    const tempMineIndex = list.findIndex(
      (msg) =>
        String(msg.id).startsWith("temp-") &&
        msg.sender_type === "user" &&
        msg.status === "sending" &&
        msg.content === incoming.content,
    );
    if (tempMineIndex >= 0 && currentUserId && String(incoming.sender_user) === currentUserId) {
      list[tempMineIndex] = { ...incoming, status: incoming.status || "sent" };
      return dedupeMessagesById(list);
    }

    list.push(incoming);
    return dedupeMessagesById(list);
  }, [currentUserId]);

  const loadConversations = useCallback(({ silent = false } = {}) => {
    const requestId = Date.now() + Math.random();
    conversationsRequestRef.current = requestId;
    if (!silent) setLoadingList(true);
    const params = {
      channel: channelFilter || undefined,
      include_closed: channelFilter === "whatsapp" ? true : undefined,
      whatsapp_window_status: channelFilter === "whatsapp" && !dealId ? conversationStatusFilter : undefined,
      whatsapp_phone_number: channelFilter === "whatsapp" ? selectedWhatsAppLine || undefined : undefined,
      search_text: searchQuery || undefined,
      search: searchQuery || undefined,
      deal_stage: filters.dealStage || undefined,
      deal_opened_from: filters.dealOpenedFrom || undefined,
      deal_opened_to: filters.dealOpenedTo || undefined,
      responsible: filters.responsible || undefined,
    };
    fetchAllPages(fetchConversations, params, 100)
      .then((data) => {
        if (conversationsRequestRef.current !== requestId) return;
        setConversations((prev) => {
          const prevRows = prev?.results || [];
          const nextRows = mergeConversationCollections(prevRows, data?.results || [], {
            preserveConversationId: dealId ? activeId : null,
          });
          const isSame =
            prev?.count === Math.max(data?.count || 0, nextRows.length) &&
            prevRows.length === nextRows.length &&
            prevRows.every((row, index) => {
              const next = nextRows[index];
              return (
                String(row.id) === String(next?.id) &&
                String(row.last_message_at || "") === String(next?.last_message_at || "") &&
                String(row.ai_mode_enabled || false) === String(next?.ai_mode_enabled || false) &&
                String(row.unread_count || 0) === String(next?.unread_count || 0) &&
                String(row.status || "") === String(next?.status || "") &&
                String(row.whatsapp_phone_number || "") === String(next?.whatsapp_phone_number || "") &&
                String(row.is_whatsapp_window_closed || false) === String(next?.is_whatsapp_window_closed || false) &&
                String(row.customer_service_window_expires || "") === String(next?.customer_service_window_expires || "") &&
                String(row.last_inbound_message_at || "") === String(next?.last_inbound_message_at || "")
              );
            });
          return isSame ? prev : { ...data, count: Math.max(data?.count || 0, nextRows.length), results: nextRows };
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!silent && conversationsRequestRef.current === requestId) {
          setLoadingList(false);
        }
      });
  }, [searchQuery, filters, channelFilter, selectedWhatsAppLine, conversationStatusFilter, mergeConversationCollections, dealId, activeId]);

  const extractApiError = (error, fallback = "No fue posible completar la operación.") => {
    const payload = error?.response?.data?.data ?? error?.response?.data ?? {};
    if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    if (payload && typeof payload === "object") {
      const firstKey = Object.keys(payload)[0];
      const firstVal = firstKey ? payload[firstKey] : null;
      if (Array.isArray(firstVal) && firstVal.length > 0) return String(firstVal[0]);
      if (typeof firstVal === "string" && firstVal.trim()) return firstVal;
    }
    return fallback;
  };

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 991.98px)");
    const syncViewport = () => setIsMobileViewport(media.matches);
    syncViewport();
    media.addEventListener?.("change", syncViewport);
    return () => media.removeEventListener?.("change", syncViewport);
  }, []);

  useEffect(() => {
    if (isMobileViewport) {
      setSidebarCollapsed(false);
    }
  }, [isMobileViewport]);

  useEffect(() => {
    if (!chatEventVersion) return;
    loadConversations({ silent: true });
  }, [chatEventVersion, loadConversations]);

  useEffect(() => {
    const incomingConversation = lastChatEvent?.conversation;
    if (!incomingConversation?.id) return;
    upsertConversationRow(incomingConversation);
  }, [lastChatEvent, upsertConversationRow]);

  useEffect(() => {
    fetchUsers({ page_size: 200, is_active: true })
      .then((data) => setResponsibleOptions(data.results || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCompanies({ page_size: 200 })
      .then((data) => setCompanyOptions(data.results || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPipelineStages({ page_size: 200 })
      .then((data) => {
        const rows = (data.results || [])
          .map((stage) => ({
            value: stage.key,
            label: stage.name,
            position: Number(stage.position || 0),
            isClosedStage: Boolean(stage.is_closed_stage),
          }))
          .sort((a, b) => a.position - b.position);
        setPipelineStages(rows);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchWhatsAppPhoneNumbers({ page_size: 200 })
      .then((data) => setWhatsAppLines(data.results || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canManageAiConfigs) return;
    fetchAiConfigurations({ page_size: 100 })
      .then((data) => setAiConfigs(data.results || []))
      .catch(() => {});
  }, [canManageAiConfigs]);

  useEffect(() => {
    if (!canManageAiConfigs) return;
    fetchGlobalAiMode()
      .then((data) => setGlobalAiModeEnabled(Boolean(data?.enabled)))
      .catch(() => {});
  }, [canManageAiConfigs]);

  const loadMessages = useCallback((convId, { silent = false } = {}) => {
    if (!convId) {
      messagesRequestRef.current += 1;
      setMessages({ results: [], count: 0 });
      setMessageLoadError("");
      setLoadingMsg(false);
      return;
    }
    const requestId = Date.now() + Math.random();
    messagesRequestRef.current = requestId;
    setMessageLoadError("");
    if (!silent) setLoadingMsg(true);
    fetchMessages(convId, { page_size: 100 })
      .then((data) => {
        if (messagesRequestRef.current !== requestId) return;
        const normalized = normalizeMessagesPayload(data);
        setMessages(normalized);
      })
      .catch((error) => {
        if (messagesRequestRef.current !== requestId) return;
        setMessages({ results: [], count: 0 });
        setMessageLoadError(extractApiError(error, "No se pudo cargar el histórico de la conversación."));
      })
      .finally(() => {
        if (messagesRequestRef.current === requestId) {
          setLoadingMsg(false);
        }
      });
    markRead(convId).catch(() => {});
  }, []);

  const activateConversation = useCallback((conversationId, { openChatOnMobile = true } = {}) => {
    const nextId = conversationId ? String(conversationId) : null;
    setComposerError("");
    setMessageLoadError("");
    if (!nextId) {
      setActiveId(null);
      loadMessages(null);
      return;
    }
    if (String(activeId || "") !== nextId) {
      setMessages({ results: [], count: 0 });
    }
    setActiveId(nextId);
    loadMessages(nextId);
    if (openChatOnMobile && isMobileViewport) {
      setMobileSection("chat");
    }
  }, [activeId, isMobileViewport, loadMessages]);

  useEffect(() => {
    if (dealId && !activeId) {
      createOrOpenConversation({ deal: dealId, channel: "whatsapp" })
        .then((conv) => {
          upsertConversationRow(conv);
          activateConversation(conv.id, { openChatOnMobile: false });
          loadConversations({ silent: true });
        })
        .catch(() => {});
    }
  }, [dealId, activeId, activateConversation, loadConversations, upsertConversationRow]);

  useEffect(() => {
    setChannelFilter("whatsapp");
  }, [dealId]);

  useEffect(() => {
    if (channelFilter !== "whatsapp" && selectedWhatsAppLine) {
      setSelectedWhatsAppLine("");
    }
  }, [channelFilter, selectedWhatsAppLine]);

  useEffect(() => {
    if (channelFilter !== "whatsapp" && conversationStatusFilter !== "open") {
      setConversationStatusFilter("open");
    }
  }, [channelFilter, conversationStatusFilter]);

  useEffect(() => {
    if (!activeId) {
      loadMessages(null);
    }
  }, [activeId, loadMessages]);

  const handleWsMessageCreated = useCallback((incoming) => {
    const incomingConversationId = incoming?.conversation ? String(incoming.conversation) : null;
    if (incomingConversationId && String(activeId || "") === incomingConversationId) {
      setMessages((prev) => ({
        ...prev,
        results: mergeIncomingMessage(prev.results || [], incoming),
      }));
    }
    if (incomingConversationId) {
      upsertConversationRow({
        id: incomingConversationId,
        last_message_at: incoming.created_at || null,
        last_message_preview: incoming.content || "",
      });
    }
    if (incomingConversationId && String(activeId || "") !== incomingConversationId) {
      loadConversations({ silent: true });
    }
  }, [mergeIncomingMessage, activeId, upsertConversationRow, loadConversations]);

  const handleWsMessageUpdated = useCallback((incoming) => {
    setMessages((prev) => ({
      ...prev,
      results: (prev.results || []).map((msg) =>
        String(msg.id) === String(incoming.id) ? { ...msg, ...incoming } : msg,
      ),
    }));
  }, []);

  const handleWsTyping = useCallback((payload) => {
    if (payload.user_id && currentUserId && payload.user_id === currentUserId) return;
    setPeerTyping(Boolean(payload.typing));
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    if (payload.typing) {
      typingStopRef.current = setTimeout(() => setPeerTyping(false), 4000);
    }
  }, [currentUserId]);

  const { status: wsStatus, sendJson: sendWsJson } = useConversationWebSocket({
    conversationId: activeId,
    token,
    onMessageCreated: handleWsMessageCreated,
    onMessageUpdated: handleWsMessageUpdated,
    onTyping: handleWsTyping,
  });

  const sendTypingWs = (typing) => {
    sendWsJson({ type: "typing", typing });
  };

  const handleInputChange = (e) => {
    const v = e.target.value;
    setInput(v);
    if (wsStatus !== "connected") return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTypingWs(true);
    typingTimerRef.current = setTimeout(() => {
      sendTypingWs(false);
      typingTimerRef.current = null;
    }, 1500);
  };

  const handleInsertEmoji = (emoji) => {
    setInput((prev) => `${prev || ""}${emoji}`);
  };

  const submitMessage = async (content, retryTempId = null) => {
    if (!activeId || !content.trim()) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTypingWs(false);
    const messageContent = content.trim();

    const tempId = retryTempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempMessage = {
      id: tempId,
      conversation: activeId,
      sender_type: "user",
      sender_user: currentUserId,
      content: messageContent,
      message_type: "text",
      status: "sending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setMessages((prev) => {
      const existing = prev.results || [];
      const already = existing.find((msg) => String(msg.id) === String(tempId));
      const next = already
        ? existing.map((msg) => (String(msg.id) === String(tempId) ? tempMessage : msg))
        : [...existing, tempMessage];
      return { ...prev, results: next };
    });

    try {
      const created = await sendMessage(activeId, { content: messageContent, message_type: "text" });
      setMessages((prev) => {
        const updated = (prev.results || []).map((msg) =>
          String(msg.id) === String(tempId) ? { ...created, status: created.status || "sent" } : msg,
        );
        return {
          ...prev,
          results: mergeIncomingMessage(updated, { ...created, status: created.status || "sent" }),
        };
      });
      return true;
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        results: (prev.results || []).map((msg) =>
          String(msg.id) === String(tempId) ? { ...msg, status: "failed" } : msg,
        ),
      }));
      setComposerError(extractApiError(error, "No se pudo enviar el mensaje."));
      return false;
    }
  };

  const submitMessageWithAttachment = async ({ content, file }) => {
    if (!activeId || !file) return false;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    sendTypingWs(false);
    const messageContent = (content || "").trim();
    const inferredType = (file.type || "").startsWith("image/") ? "image" : "document";
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempMessage = {
      id: tempId,
      conversation: activeId,
      sender_type: "user",
      sender_user: currentUserId,
      content: messageContent || `[${inferredType === "image" ? "Imagen" : "Documento"} adjunto]`,
      message_type: inferredType,
      status: "sending",
      metadata: {
        attachment_name: file.name,
      },
      attachments: [{ id: `temp-file-${tempId}`, file_name: file.name, file_type: file.type, file_size: file.size }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setMessages((prev) => ({
      ...prev,
      results: [...(prev.results || []), tempMessage],
    }));

    const fd = new FormData();
    fd.append("content", messageContent);
    fd.append("message_type", inferredType);
    fd.append("file", file);

    try {
      const created = await sendMessage(activeId, fd);
      setMessages((prev) => {
        const updated = (prev.results || []).map((msg) =>
          String(msg.id) === String(tempId) ? { ...created, status: created.status || "sent" } : msg,
        );
        return {
          ...prev,
          results: mergeIncomingMessage(updated, { ...created, status: created.status || "sent" }),
        };
      });
      return true;
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        results: (prev.results || []).map((msg) =>
          String(msg.id) === String(tempId) ? { ...msg, status: "failed" } : msg,
        ),
      }));
      setComposerError(extractApiError(error, "No se pudo enviar el archivo adjunto."));
      return false;
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (activeConv?.channel === "whatsapp" && !canSendFreeMessage) {
      setShowTemplateSelector(true);
      return;
    }
    const draft = input;
    const file = selectedFile;
    if (!draft.trim() && !file) return;
    setComposerError("");
    setInput("");
    setSelectedFile(null);
    const ok = file ? await submitMessageWithAttachment({ content: draft, file }) : await submitMessage(draft);
    if (!ok) return;
  };

  const handleRetry = async (message) => {
    if (!message || !String(message.id).startsWith("temp-")) return;
    await submitMessage(message.content, message.id);
  };

  const validateSelectedFile = (file) => {
    if (!file) return "";
    const isWhatsApp = activeConv?.channel === "whatsapp";
    const inferredType = (file.type || "").startsWith("image/") ? "image" : "document";
    if (!isWhatsApp) {
      if (file.size > WHATSAPP_DOCUMENT_MAX_BYTES) return "El archivo supera el límite máximo (100 MB).";
      return "";
    }
    if (inferredType === "image") {
      if (!ALLOWED_WHATSAPP_IMAGE_MIME_TYPES.has(file.type || "")) {
        return "WhatsApp solo permite imágenes JPG o PNG.";
      }
      if (file.size > WHATSAPP_IMAGE_MAX_BYTES) {
        return "La imagen supera el límite de WhatsApp (5 MB).";
      }
      return "";
    }
    if (!ALLOWED_WHATSAPP_DOCUMENT_MIME_TYPES.has(file.type || "")) {
      return "Tipo de documento no permitido para WhatsApp.";
    }
    if (file.size > WHATSAPP_DOCUMENT_MAX_BYTES) {
      return "El documento supera el límite de WhatsApp (100 MB).";
    }
    return "";
  };

  const handleToggleAi = async () => {
    if (!activeId) return;
    const conv = await toggleAi(activeId);
    const on = Boolean(conv.ai_mode_enabled);
    setAiEnabled(on);
    setConversations((prev) => ({
      ...prev,
      results:
        prev.results?.map((c) => (c.id === activeId ? { ...c, ai_mode_enabled: on } : c)) ?? [],
    }));
  };

  const handleToggleGlobalAiMode = async (enabled) => {
    if (!canManageAiConfigs) return;
    const previous = globalAiModeEnabled;
    setGlobalAiModeEnabled(Boolean(enabled));
    setGlobalAiModeLoading(true);
    try {
      const data = await setGlobalAiMode(Boolean(enabled));
      setGlobalAiModeEnabled(Boolean(data?.enabled));
      setConversations((prev) => ({
        ...prev,
        results: (prev.results || []).map((c) => ({ ...c, ai_mode_enabled: Boolean(data?.enabled) })),
      }));
      setAiEnabled(Boolean(data?.enabled));
    } catch (error) {
      setGlobalAiModeEnabled(previous);
      setComposerError(extractApiError(error, "No se pudo actualizar el modo IA global."));
    } finally {
      setGlobalAiModeLoading(false);
    }
  };

  const handleClearHandoff = async () => {
    if (!activeId) return;
    setClearingHandoff(true);
    try {
      const conv = await clearHandoff(activeId);
      setConversations((prev) => ({
        ...prev,
        results:
          prev.results?.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  human_handoff_requested: conv.human_handoff_requested,
                  human_handoff_at: conv.human_handoff_at,
                }
              : c,
          ) ?? [],
      }));
    } catch {
      /* ignore */
    } finally {
      setClearingHandoff(false);
    }
  };

  const selectConv = (id) => {
    activateConversation(id);
  };

  const conversationsWithSla = useMemo(
    () =>
      (conversations.results || []).map((conv) => ({
        ...conv,
        __sla: computeConversationSla(conv),
        __remainingWindowLabel: computeRemainingWindowLabel(conv),
      })),
    [conversations.results],
  );
  const sortedConversations = useMemo(() => {
    const priority = { critical: 0, warn: 1, ok: 2, none: 3 };
    return [...conversationsWithSla].sort((a, b) => {
      const p = (priority[a.__sla?.status] ?? 99) - (priority[b.__sla?.status] ?? 99);
      if (p !== 0) return p;
      const m = (b.__sla?.minutes || 0) - (a.__sla?.minutes || 0);
      if (m !== 0) return m;
      const aDate = new Date(a.last_message_at || 0).getTime();
      const bDate = new Date(b.last_message_at || 0).getTime();
      return bDate - aDate;
    });
  }, [conversationsWithSla]);
  const lineScopedConversations = useMemo(() => {
    if (channelFilter !== "whatsapp" || !selectedWhatsAppLine) return sortedConversations;
    return sortedConversations.filter(
      (conversation) => String(conversation.whatsapp_phone_number || "") === String(selectedWhatsAppLine),
    );
  }, [sortedConversations, channelFilter, selectedWhatsAppLine]);

  const filteredConversations = useMemo(() => {
    let rows = lineScopedConversations;
    if (channelFilter === "whatsapp" && !dealId) {
      rows = rows.filter((conversation) => {
        const isClosed = conversation.status === "archived" || Boolean(conversation.is_whatsapp_window_closed);
        return conversationStatusFilter === "closed" ? isClosed : !isClosed;
      });
    }
    if (showOnlyOverdue) {
      rows = rows.filter((conversation) => conversation.__sla?.isOverdue);
    }
    return rows;
  }, [showOnlyOverdue, lineScopedConversations, channelFilter, conversationStatusFilter, dealId]);

  useEffect(() => {
    if (dealId) return;
    if (!filteredConversations.length) {
      if (activeId) setActiveId(null);
      return;
    }
    const activeStillVisible = filteredConversations.some((row) => String(row.id) === String(activeId));
    if (!activeId || !activeStillVisible) {
      activateConversation(filteredConversations[0].id, { openChatOnMobile: false });
    }
  }, [filteredConversations, activeId, dealId, activateConversation]);
  const whatsappLineCounts = useMemo(() => {
    const counts = {};
    sortedConversations.forEach((conv) => {
      const key = conv.whatsapp_phone_number || "__none__";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [sortedConversations]);
  const activeConv = useMemo(
    () => conversationsWithSla.find((c) => String(c.id) === String(activeId)) || null,
    [conversationsWithSla, activeId],
  );

  const handleToggleConversationStatus = async (nextStatus) => {
    if (!activeId) return;
    try {
      const updated = await patchConversation(activeId, { status: nextStatus });
      setConversations((prev) => ({
        ...prev,
        results: (prev.results || []).map((row) => (String(row.id) === String(activeId) ? { ...row, ...updated } : row)),
      }));
      setComposerError("");
    } catch (error) {
      setComposerError(extractApiError(error, "No se pudo actualizar el estado de la conversación."));
    }
  };

  useEffect(() => {
    if (activeConv) {
      setAiEnabled(Boolean(activeConv.ai_mode_enabled));
      setAiConfigId(activeConv.ai_configuration || "");
    }
  }, [activeConv]);

  useEffect(() => {
    if (!activeId) {
      setMobileSection("conversations");
    }
  }, [activeId]);

  const handleAiConfigChange = async (e) => {
    const v = e.target.value;
    setAiConfigId(v);
    if (!activeId || !canManageAiConfigs) return;
    setSavingAiConfig(true);
    try {
      const conv = await patchConversation(activeId, {
        ai_configuration: v || null,
      });
      setConversations((prev) => ({
        ...prev,
        results:
          prev.results?.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  ai_configuration: conv.ai_configuration,
                  ai_configuration_name: conv.ai_configuration_name,
                }
              : c,
          ) ?? [],
      }));
    } catch {
      /* ignore */
    } finally {
      setSavingAiConfig(false);
    }
  };

  const senderLabel = (m) => {
    if (m.sender_type === "user") return "Agente";
    if (m.sender_type === "contact") return "Contacto";
    if (m.sender_type === "ai_bot") return "IA";
    return m.sender_type;
  };

  const statusWarning = (m) => {
    const detailRaw = m?.metadata?.detail || m?.metadata?.error || "";
    const detail = typeof detailRaw === "string" ? detailRaw.slice(0, 180) : "";
    if (m.status === "failed" || m.status === "dead_letter") {
      return (
        <>
          <span className="app-msg-status app-msg-status--failed">
            {m.status === "dead_letter" ? "Sin reintentos" : "Envío fallido"}
          </span>
          {detail && <span className="text-danger small ms-2">{detail}</span>}
        </>
      );
    }
    if (m.status === "pending" || m.status === "sending") {
      return (
        <span className="app-msg-status app-msg-status--sending">Enviando…</span>
      );
    }
    if (m.status === "sent" || m.status === "delivered" || m.status === "read") {
      return <span className="app-msg-status app-msg-status--ok">{m.status}</span>;
    }
    return null;
  };

  const canSendFreeMessage = useMemo(() => {
    if (!activeConv) return false;
    if (activeConv.channel !== "whatsapp") return true;
    if (!activeConv.customer_service_window_expires) return false;
    const expiry = new Date(activeConv.customer_service_window_expires).getTime();
    if (Number.isNaN(expiry)) return false;
    return expiry > Date.now();
  }, [activeConv]);
  const messageCount = messages?.results?.length || 0;
  const lastMessageAt = useMemo(() => {
    const rows = messages?.results || [];
    if (!rows.length) return null;
    return rows[rows.length - 1]?.created_at || null;
  }, [messages?.results]);
  const serviceWindowOpen = useMemo(() => {
    if (!activeConv || activeConv.channel !== "whatsapp") return null;
    if (!activeConv.customer_service_window_expires) return false;
    const expiry = new Date(activeConv.customer_service_window_expires).getTime();
    if (Number.isNaN(expiry)) return false;
    return expiry > Date.now();
  }, [activeConv]);
  const pendingReplySla = useMemo(
    () => computePendingReplySla(messages?.results || []),
    [messages?.results],
  );

  const dealStages = useMemo(
    () => pipelineStages.map((stage) => [stage.value, stage.label]),
    [pipelineStages],
  );
  const orderedStageKeys = useMemo(() => pipelineStages.map((stage) => stage.value), [pipelineStages]);

  useEffect(() => {
    const dealId = activeConv?.deal || activeConv?.latest_deal_id;
    if (!dealId) {
      setDealDetail(null);
      setDealDraft({
        title: activeConv?.deal_title || `Lead WhatsApp - ${activeConv?.contact_name || "Nuevo contacto"}`,
        stage: pipelineStages[0]?.value || "new_lead",
        value: 0,
        probability: 10,
        expected_close_date: "",
        assigned_to: activeConv?.assigned_to || activeConv?.latest_deal_assigned_to || "",
        company: "",
        business_notes: "",
      });
      setDealSaveError("");
      setDealCreateError("");
      return;
    }
    setLoadingDeal(true);
    setDealSaveError("");
    fetchDeal(dealId)
      .then((deal) => {
        setDealDetail(deal);
        setDealDraft({
          title: deal.title || "",
          stage: deal.stage || "new_lead",
          value: deal.value ?? 0,
          probability: deal.probability ?? 0,
          expected_close_date: deal.expected_close_date || "",
          assigned_to: deal.assigned_to || "",
          company: deal.company || "",
          business_notes: deal.business_notes || "",
        });
      })
      .catch(() => {
        setDealDetail(null);
        setDealDraft(null);
        setDealSaveError("No se pudo cargar el deal asociado.");
      })
      .finally(() => setLoadingDeal(false));
  }, [
    activeConv?.assigned_to,
    activeConv?.contact_name,
    activeConv?.deal,
    activeConv?.deal_title,
    activeConv?.latest_deal_assigned_to,
    activeConv?.latest_deal_id,
    pipelineStages,
  ]);

  const handleDealDraftChange = (field, value) => {
    setDealDraft((prev) => ({
      ...(prev || {}),
      [field]: value,
    }));
  };

  const handleSaveDealQuickEdit = async () => {
    if (!dealDetail?.id || !dealDraft) return;
    setSavingDeal(true);
    setDealSaveError("");
    try {
      const payload = {
        title: dealDraft.title?.trim() || dealDetail.title || "",
        stage: dealDraft.stage,
        value: Number(dealDraft.value || 0),
        probability: Number(dealDraft.probability || 0),
        expected_close_date: dealDraft.expected_close_date || null,
        assigned_to: dealDraft.assigned_to || null,
        company: dealDraft.company || null,
        business_notes: dealDraft.business_notes || "",
      };
      const updated = await updateDeal(dealDetail.id, payload);
      setDealDetail(updated);
      setDealDraft({
        title: updated.title || "",
        stage: updated.stage || "new_lead",
        value: updated.value ?? 0,
        probability: updated.probability ?? 0,
        expected_close_date: updated.expected_close_date || "",
        assigned_to: updated.assigned_to || "",
        company: updated.company || "",
        business_notes: updated.business_notes || "",
      });
      setConversations((prev) => ({
        ...prev,
        results:
          prev.results?.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  latest_deal_stage: updated.stage,
                  latest_deal_assigned_to: updated.assigned_to,
                }
              : c,
          ) ?? [],
      }));
    } catch (error) {
      setDealSaveError(extractApiError(error, "No se pudo guardar el deal."));
    } finally {
      setSavingDeal(false);
    }
  };

  const handleCreateDealFromChat = async () => {
    if (!activeConv?.contact || !dealDraft) return;
    setSavingDeal(true);
    setDealCreateError("");
    setDealSaveError("");
    try {
      const created = await createDeal({
        title: dealDraft.title?.trim() || `Lead WhatsApp - ${activeConv.contact_name || "Nuevo contacto"}`,
        contact: activeConv.contact,
        stage: dealDraft.stage || pipelineStages[0]?.value || "new_lead",
        value: Number(dealDraft.value || 0),
        probability: Number(dealDraft.probability || 0),
        expected_close_date: dealDraft.expected_close_date || null,
        assigned_to: dealDraft.assigned_to || null,
        company: dealDraft.company || null,
        business_notes: dealDraft.business_notes || "",
        description: "",
        currency: dealDetail?.currency || "USD",
      });
      const linkedConversation = await patchConversation(activeId, {
        deal: created.id,
        assigned_to: created.assigned_to || activeConv.assigned_to || null,
        status: activeConv.status || "active",
      });
      setDealDetail(created);
      setDealDraft({
        title: created.title || "",
        stage: created.stage || pipelineStages[0]?.value || "new_lead",
        value: created.value ?? 0,
        probability: created.probability ?? 0,
        expected_close_date: created.expected_close_date || "",
        assigned_to: created.assigned_to || "",
        company: created.company || "",
        business_notes: created.business_notes || "",
      });
      setConversations((prev) => ({
        ...prev,
        results:
          prev.results?.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  ...linkedConversation,
                  deal: created.id,
                  deal_title: created.title,
                  latest_deal_id: created.id,
                  latest_deal_stage: created.stage,
                  latest_deal_assigned_to: created.assigned_to,
                }
              : c,
          ) ?? [],
      }));
    } catch (error) {
      setDealCreateError(extractApiError(error, "No se pudo crear el deal desde el chat."));
    } finally {
      setSavingDeal(false);
    }
  };

  const handleAdvanceDealStage = async () => {
    if (!dealDetail?.id || !dealDraft?.stage) return;
    const currentIndex = orderedStageKeys.indexOf(dealDraft.stage);
    if (currentIndex < 0 || currentIndex >= orderedStageKeys.length - 1) return;
    const nextStage = orderedStageKeys[currentIndex + 1];
    setSavingDeal(true);
    setDealSaveError("");
    try {
      const updated = await moveDealStage(dealDetail.id, {
        to_stage: nextStage,
        notes: "Movimiento rápido desde chat",
      });
      setDealDetail(updated);
      setDealDraft((prev) => ({
        ...(prev || {}),
        stage: updated.stage || nextStage,
        value: updated.value ?? prev?.value ?? 0,
        probability: updated.probability ?? prev?.probability ?? 0,
        expected_close_date: updated.expected_close_date || prev?.expected_close_date || "",
        assigned_to: updated.assigned_to || prev?.assigned_to || "",
      }));
      setConversations((prev) => ({
        ...prev,
        results:
          prev.results?.map((c) =>
            c.id === activeId
              ? {
                  ...c,
                  latest_deal_stage: updated.stage,
                  latest_deal_assigned_to: updated.assigned_to,
                }
              : c,
          ) ?? [],
      }));
    } catch (error) {
      setDealSaveError(extractApiError(error, "No se pudo mover a la siguiente etapa."));
    } finally {
      setSavingDeal(false);
    }
  };

  const handleSendTemplate = async (templateId, variables) => {
    if (!activeId || !templateId) return;
    await sendTemplateMessage(activeId, {
      template_id: templateId,
      variables,
    });
    setShowTemplateSelector(false);
  };

  return (
    <div className="app-page app-chat-page">
      <div className="app-page-header app-page-headline app-chat-headline mb-3">
        <div className="app-chat-headline-copy">
          <div className="app-chat-breadcrumb">General / Conversaciones</div>
          <h1 className="h4 mb-1">Conversaciones</h1>
          <p className="text-muted mb-0 app-chat-headline-subtitle">Gestión centralizada de WhatsApp, IA y seguimiento comercial.</p>
        </div>
        <div className="app-chat-headline-actions">
          {canManageAiConfigs && (
            <Form.Check
              type="switch"
              id="chat-global-ai-switch"
              className="app-chat-global-ai-toggle"
              label={globalAiModeLoading ? "Actualizando IA..." : "IA global"}
              checked={Boolean(globalAiModeEnabled)}
              disabled={globalAiModeLoading}
              onChange={(e) => { void handleToggleGlobalAiMode(e.target.checked); }}
            />
          )}
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm d-none d-lg-inline-flex"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? "Mostrar bandeja de chats" : "Ocultar bandeja de chats"}
          >
            <i className={`bi ${sidebarCollapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar"}`} />
            <span className="ms-1">{sidebarCollapsed ? "Bandeja" : "Ocultar bandeja"}</span>
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm app-chat-action-btn"
            onClick={() => setChatFiltersModalOpen(true)}
            aria-label="Abrir filtros"
          >
            <i className="bi bi-funnel" />
            <span className="ms-1 app-chat-action-label">Filtros</span>
          </button>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm app-chat-action-btn"
            onClick={() => setChatInfoModalOpen(true)}
            disabled={!activeConv}
            aria-label="Abrir información de conversación"
          >
            <i className="bi bi-info-circle" />
            <span className="ms-1 app-chat-action-label">Información</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm app-chat-action-btn"
            onClick={() => setQuickDealModalOpen(true)}
            disabled={!activeConv}
            aria-label="Abrir panel comercial del lead"
          >
            <i className="bi bi-briefcase" />
            <span className="ms-1 app-chat-action-label">Lead</span>
          </button>
        </div>
      </div>
      <div className="app-chat-mobile-tabs d-lg-none mb-2">
        <button
          type="button"
          className={`btn btn-sm ${mobileSection === "conversations" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setMobileSection("conversations")}
        >
          Conversaciones
        </button>
        <button
          type="button"
          className={`btn btn-sm ${mobileSection === "chat" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setMobileSection("chat")}
          disabled={!activeId}
        >
          Chat
        </button>
      </div>
      <div
        className={`app-chat-layout ${(sidebarCollapsed && !isMobileViewport) ? "app-chat-layout-sidebar-collapsed" : ""}`}
      >
        {(!sidebarCollapsed || isMobileViewport) && (
          <ChatSidebar
            loading={loadingList}
            conversations={filteredConversations}
            totalCount={filteredConversations.length}
            activeId={activeId}
            onSelect={selectConv}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            channelFilter={channelFilter}
            onChannelFilterChange={setChannelFilter}
            whatsAppLines={whatsAppLines}
            selectedWhatsAppLine={selectedWhatsAppLine}
            onSelectWhatsAppLine={setSelectedWhatsAppLine}
            whatsAppLineCounts={whatsappLineCounts}
            statusFilter={conversationStatusFilter}
            onStatusFilterChange={setConversationStatusFilter}
            className={mobileSection !== "conversations" ? "d-none d-lg-flex" : ""}
          />
        )}
        <div className={`app-chat-panel app-chat-center ${mobileSection !== "chat" ? "d-none d-lg-flex" : ""}`}>
          {!activeId && (
            <p className="text-muted mb-0">Selecciona una conversación o abre desde un contacto.</p>
          )}
          {activeId && (
            <>
              <div className="app-chat-center-body">
                <ChatThread
                  loading={loadingMsg}
                  messages={messages.results || []}
                  activeConv={activeConv}
                  wsStatus={wsStatus}
                  peerTyping={peerTyping}
                  aiEnabled={aiEnabled}
                  clearingHandoff={clearingHandoff}
                  onToggleAi={handleToggleAi}
                  onClearHandoff={handleClearHandoff}
                  onRetry={handleRetry}
                  onOpenDealPanel={() => setQuickDealModalOpen(true)}
                  onToggleConversationStatus={handleToggleConversationStatus}
                  senderLabel={senderLabel}
                  statusWarning={statusWarning}
                  messageLoadError={messageLoadError}
                />
                <ChatComposer
                  value={input}
                  onChange={handleInputChange}
                  onSubmit={handleSend}
                  disabled={!activeId}
                  canFreeMessage={canSendFreeMessage}
              onOpenTemplate={() => setShowTemplateSelector(true)}
              selectedFileName={selectedFile?.name || ""}
              onPickFile={(file) => {
                const validationError = validateSelectedFile(file);
                if (validationError) {
                      setComposerError(validationError);
                      setSelectedFile(null);
                      return;
                }
                setComposerError("");
                setSelectedFile(file || null);
              }}
              onClearFile={() => {
                setSelectedFile(null);
                setComposerError("");
              }}
              onInsertEmoji={handleInsertEmoji}
            />
                {composerError && (
                  <Alert variant="warning" className="py-2 px-3 small mt-2 mb-0">
                    {composerError}
                  </Alert>
                )}
              </div>
              <TemplateSelector
                show={showTemplateSelector}
                onHide={() => setShowTemplateSelector(false)}
                onSend={handleSendTemplate}
              />
            </>
          )}
          <div className="app-chat-backlink">
            <a href="/crm/contacts">← Volver al CRM</a>
          </div>
        </div>
      </div>
      <Modal show={chatFiltersModalOpen} onHide={() => setChatFiltersModalOpen(false)} centered>
        <Modal.Header closeButton><Modal.Title>Filtros de bandeja</Modal.Title></Modal.Header>
        <Modal.Body className="d-flex flex-column gap-2">
          <Form.Group>
            <Form.Label>Canal</Form.Label>
            <Form.Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="">Todos</option>
            </Form.Select>
          </Form.Group>
          {channelFilter === "whatsapp" && (
            <Form.Group>
              <Form.Label>Línea de WhatsApp</Form.Label>
              <Form.Select value={selectedWhatsAppLine} onChange={(e) => setSelectedWhatsAppLine(e.target.value)}>
                <option value="">Todas</option>
                {whatsAppLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.line_name || line.internal_name || line.verified_name || line.display_phone_number}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
          {channelFilter === "whatsapp" && (
            <Form.Group>
              <Form.Label>Estado de conversación</Form.Label>
              <Form.Select value={conversationStatusFilter} onChange={(e) => setConversationStatusFilter(e.target.value)}>
                <option value="open">Abiertas</option>
                <option value="closed">Cerradas</option>
              </Form.Select>
            </Form.Group>
          )}
          <Form.Group>
            <Form.Label>Etapa del deal</Form.Label>
            <Form.Select value={filters.dealStage} onChange={(e) => setFilters((p) => ({ ...p, dealStage: e.target.value }))}>
              <option value="">Todas</option>
              {dealStages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Form.Select>
          </Form.Group>
          <div className="d-flex gap-2">
            <Form.Group className="w-100">
              <Form.Label>Desde</Form.Label>
              <Form.Control type="date" value={filters.dealOpenedFrom} onChange={(e) => setFilters((p) => ({ ...p, dealOpenedFrom: e.target.value }))} />
            </Form.Group>
            <Form.Group className="w-100">
              <Form.Label>Hasta</Form.Label>
              <Form.Control type="date" value={filters.dealOpenedTo} onChange={(e) => setFilters((p) => ({ ...p, dealOpenedTo: e.target.value }))} />
            </Form.Group>
          </div>
          <Form.Group>
            <Form.Label>Responsable</Form.Label>
            <Form.Select value={filters.responsible} onChange={(e) => setFilters((p) => ({ ...p, responsible: e.target.value }))}>
              <option value="">Todos</option>
              {responsibleOptions.map((u) => (
                <option key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Check type="switch" label="Solo vencidas SLA" checked={Boolean(showOnlyOverdue)} onChange={(e) => setShowOnlyOverdue(e.target.checked)} />
          {canManageAiConfigs && (
            <Form.Check
              type="switch"
              label="Modo IA global"
              checked={Boolean(globalAiModeEnabled)}
              disabled={globalAiModeLoading}
              onChange={(e) => { void handleToggleGlobalAiMode(e.target.checked); }}
            />
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setChatFiltersModalOpen(false)}>Cerrar</Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={chatInfoModalOpen}
        onHide={() => setChatInfoModalOpen(false)}
        centered
        size="xl"
        dialogClassName="app-chat-info-modal"
      >
        <Modal.Header closeButton><Modal.Title>Información de conversación</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="app-chat-kpi-row">
            <div className="app-chat-kpi-card">
              <span className="app-chat-kpi-label">Ventana WhatsApp</span>
              <strong className={serviceWindowOpen ? "text-success" : "text-muted"}>
                {serviceWindowOpen === null ? "No aplica" : serviceWindowOpen ? "Abierta" : "Cerrada"}
              </strong>
            </div>
            <div className="app-chat-kpi-card">
              <span className="app-chat-kpi-label">Último mensaje</span>
              <strong>{formatRelativeTime(lastMessageAt)}</strong>
              <span className="small text-muted">{formatDateTime(lastMessageAt)}</span>
            </div>
            <div className="app-chat-kpi-card">
              <span className="app-chat-kpi-label">Mensajes cargados</span>
              <strong>{messageCount}</strong>
            </div>
            <div className={`app-chat-kpi-card app-chat-kpi-card-sla app-chat-kpi-card-sla--${pendingReplySla.status}`}>
              <span className="app-chat-kpi-label">SLA</span>
              <strong>{pendingReplySla.label}</strong>
              <span className="small">{pendingReplySla.detail}</span>
            </div>
          </div>
          {canManageAiConfigs && (
            <Form.Group className="mt-2" controlId="conv-ai-config-modal">
              <Form.Label className="small text-muted mb-1">Configuración IA</Form.Label>
              <Form.Select size="sm" value={aiConfigId || ""} onChange={(e) => { void handleAiConfigChange(e); }} disabled={savingAiConfig}>
                <option value="">Predeterminada del sistema</option>
                {aiConfigs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_default ? " (predeterminada)" : ""}</option>)}
              </Form.Select>
            </Form.Group>
          )}
        </Modal.Body>
      </Modal>
      <div className={`app-chat-deal-drawer ${quickDealModalOpen ? "is-open" : ""}`}>
        <button type="button" className="app-chat-deal-drawer-backdrop border-0" onClick={() => setQuickDealModalOpen(false)} aria-label="Cerrar panel comercial" />
        <div className="app-chat-deal-drawer-panel">
          <div className="d-flex justify-content-between align-items-start gap-3 mb-3">
            <div>
              <div className="small text-muted text-uppercase fw-semibold">Panel comercial</div>
              <h3 className="h5 mb-0">Lead / deal</h3>
            </div>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setQuickDealModalOpen(false)}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
          {loadingDeal ? <p className="small text-muted mb-0">Cargando deal...</p> : null}
          {!loadingDeal && !dealDetail && !dealDraft ? <p className="small text-muted mb-0">Este chat no tiene deal asociado.</p> : null}
          {!loadingDeal && dealDraft ? (
            <div className="d-flex flex-column gap-3">
              {!dealDetail ? (
                <Alert variant="info" className="py-2 px-3 small mb-0">
                  Esta conversación aún no tiene deal. Puedes crearlo y asociarlo desde este panel.
                </Alert>
              ) : null}
              <Form.Group>
                <Form.Label>Título</Form.Label>
                <Form.Control value={dealDraft.title || ""} onChange={(e) => handleDealDraftChange("title", e.target.value)} />
              </Form.Group>
              <Form.Group>
                <Form.Label>Etapa</Form.Label>
                <Form.Select value={dealDraft.stage} onChange={(e) => handleDealDraftChange("stage", e.target.value)}>
                  {dealStages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group>
                <Form.Label>Responsable</Form.Label>
                <Form.Select value={dealDraft.assigned_to || ""} onChange={(e) => handleDealDraftChange("assigned_to", e.target.value)}>
                  <option value="">Sin asignar</option>
                  {responsibleOptions.map((u) => <option key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group>
                <Form.Label>Empresa</Form.Label>
                <Form.Select value={dealDraft.company || ""} onChange={(e) => handleDealDraftChange("company", e.target.value)}>
                  <option value="">Sin empresa</option>
                  {companyOptions.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </Form.Select>
              </Form.Group>
              <div className="row g-3">
                <div className="col-6">
                  <Form.Group>
                    <Form.Label>Valor</Form.Label>
                    <Form.Control type="number" min="0" step="0.01" value={dealDraft.value} onChange={(e) => handleDealDraftChange("value", e.target.value)} />
                  </Form.Group>
                </div>
                <div className="col-6">
                  <Form.Group>
                    <Form.Label>Probabilidad (%)</Form.Label>
                    <Form.Control type="number" min="0" max="100" value={dealDraft.probability} onChange={(e) => handleDealDraftChange("probability", e.target.value)} />
                  </Form.Group>
                </div>
              </div>
              <Form.Group>
                <Form.Label>Cierre estimado</Form.Label>
                <Form.Control type="date" value={dealDraft.expected_close_date || ""} onChange={(e) => handleDealDraftChange("expected_close_date", e.target.value)} />
              </Form.Group>
              <Form.Group>
                <Form.Label>Notas de negocio</Form.Label>
                <Form.Control as="textarea" rows={8} value={dealDraft.business_notes || ""} onChange={(e) => handleDealDraftChange("business_notes", e.target.value)} />
              </Form.Group>
              {dealCreateError ? <Alert variant="warning" className="py-2 px-3 small mb-0">{dealCreateError}</Alert> : null}
              {dealSaveError ? <Alert variant="warning" className="py-2 px-3 small mb-0">{dealSaveError}</Alert> : null}
              <div className="d-flex flex-wrap gap-2 pt-2">
                {dealDetail ? (
                  <>
                    <Button variant="outline-primary" onClick={() => { void handleAdvanceDealStage(); }} disabled={savingDeal || !dealDraft || orderedStageKeys.indexOf(dealDraft.stage) >= orderedStageKeys.length - 1}>
                      Siguiente etapa
                    </Button>
                    <Button variant="primary" onClick={() => { void handleSaveDealQuickEdit(); }} disabled={savingDeal || !dealDetail}>
                      {savingDeal ? "Guardando..." : "Guardar cambios"}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" onClick={() => { void handleCreateDealFromChat(); }} disabled={savingDeal || !activeConv?.contact}>
                    {savingDeal ? "Creando..." : "Crear y asociar deal"}
                  </Button>
                )}
                {dealDetail?.id ? (
                  <Button as="a" href={`/crm/deals/${dealDetail.id}`} variant="outline-secondary">
                    Abrir deal
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ChatView;
