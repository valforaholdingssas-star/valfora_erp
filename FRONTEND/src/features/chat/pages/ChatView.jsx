import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Form } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";

import { fetchAiConfigurations } from "../../../api/aiConfig.js";
import {
  clearHandoff,
  createOrOpenConversation,
  fetchConversations,
  fetchMessages,
  markRead,
  patchConversation,
  sendMessage,
  sendTemplateMessage,
  toggleAi,
} from "../../../api/chat.js";
import { fetchDeal, moveDealStage, updateDeal } from "../../../api/crm.js";
import { fetchUsers } from "../../../api/users.js";
import { useAuth } from "../../../contexts/AuthContext.jsx";
import ChatComposer from "../components/ChatComposer.jsx";
import ChatSidebar from "../components/ChatSidebar.jsx";
import TemplateSelector from "../components/TemplateSelector.jsx";
import ChatThread from "../components/ChatThread.jsx";
import useConversationWebSocket from "../hooks/useConversationWebSocket.js";

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
  const { dealId } = useParams();
  const [conversations, setConversations] = useState({ results: [], count: 0 });
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState({ results: [], count: 0 });
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState(dealId ? "internal" : "whatsapp");
  const [filters, setFilters] = useState({
    dealStage: "",
    dealOpenedFrom: "",
    dealOpenedTo: "",
    responsible: "",
  });
  const [responsibleOptions, setResponsibleOptions] = useState([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [clearingHandoff, setClearingHandoff] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [aiConfigs, setAiConfigs] = useState([]);
  const [aiConfigId, setAiConfigId] = useState("");
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [composerError, setComposerError] = useState("");
  const [dealDetail, setDealDetail] = useState(null);
  const [dealDraft, setDealDraft] = useState(null);
  const [loadingDeal, setLoadingDeal] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealSaveError, setDealSaveError] = useState("");
  const [dealPanelCollapsed, setDealPanelCollapsed] = useState(false);
  const typingTimerRef = useRef(null);
  const typingStopRef = useRef(null);

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

  const loadConversations = useCallback(() => {
    setLoadingList(true);
    const params = {
      page_size: 50,
      channel: channelFilter || undefined,
      search_text: searchQuery || undefined,
      search: searchQuery || undefined,
      deal_stage: filters.dealStage || undefined,
      deal_opened_from: filters.dealOpenedFrom || undefined,
      deal_opened_to: filters.dealOpenedTo || undefined,
      responsible: filters.responsible || undefined,
    };
    fetchConversations(params)
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [searchQuery, filters, channelFilter]);

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
    fetchUsers({ page_size: 200, is_active: true })
      .then((data) => setResponsibleOptions(data.results || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canManageAiConfigs) return;
    fetchAiConfigurations({ page_size: 100 })
      .then((data) => setAiConfigs(data.results || []))
      .catch(() => {});
  }, [canManageAiConfigs]);

  const loadMessages = useCallback((convId) => {
    if (!convId) return;
    setLoadingMsg(true);
    fetchMessages(convId, { page_size: 100 })
      .then((data) => {
        setMessages({ ...data, results: data.results || [] });
      })
      .catch(() => {})
      .finally(() => setLoadingMsg(false));
    markRead(convId).catch(() => {});
  }, []);

  useEffect(() => {
    if (dealId && !activeId) {
      createOrOpenConversation({ deal: dealId, channel: "internal" })
        .then((conv) => {
          setActiveId(conv.id);
          loadConversations();
        })
        .catch(() => {});
    }
  }, [dealId, activeId, loadConversations]);

  useEffect(() => {
    setChannelFilter(dealId ? "internal" : "whatsapp");
  }, [dealId]);

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId);
    }
  }, [activeId, loadMessages]);

  const handleWsMessageCreated = useCallback((incoming) => {
    setMessages((prev) => ({
      ...prev,
      results: mergeIncomingMessage(prev.results || [], incoming),
    }));
  }, [mergeIncomingMessage]);

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
    setActiveId(id);
  };

  useEffect(() => {
    if (conversations.results?.length && !activeId && !dealId) {
      setActiveId(conversations.results[0].id);
    }
  }, [conversations, activeId, dealId]);

  const activeConv = conversations.results?.find((c) => c.id === activeId);
  const filteredConversations = useMemo(() => conversations.results || [], [conversations.results]);

  useEffect(() => {
    if (activeConv) {
      setAiEnabled(Boolean(activeConv.ai_mode_enabled));
      setAiConfigId(activeConv.ai_configuration || "");
    }
  }, [activeConv]);

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

  const dealStages = useMemo(
    () => [
      ["new_lead", "Nuevo lead"],
      ["contacted", "Contactado"],
      ["qualified", "Calificado"],
      ["qualification", "Calificación (legacy)"],
      ["proposal", "Propuesta"],
      ["negotiation", "Negociación"],
      ["closed_won", "Cerrado ganado"],
      ["closed_lost", "Cerrado perdido"],
    ],
    [],
  );
  const orderedStageKeys = useMemo(() => dealStages.map(([value]) => value), [dealStages]);

  useEffect(() => {
    const dealId = activeConv?.deal || activeConv?.latest_deal_id;
    if (!dealId) {
      setDealDetail(null);
      setDealDraft(null);
      setDealSaveError("");
      return;
    }
    setLoadingDeal(true);
    setDealSaveError("");
    fetchDeal(dealId)
      .then((deal) => {
        setDealDetail(deal);
        setDealDraft({
          stage: deal.stage || "new_lead",
          value: deal.value ?? 0,
          probability: deal.probability ?? 0,
          expected_close_date: deal.expected_close_date || "",
          assigned_to: deal.assigned_to || "",
        });
      })
      .catch(() => {
        setDealDetail(null);
        setDealDraft(null);
        setDealSaveError("No se pudo cargar el deal asociado.");
      })
      .finally(() => setLoadingDeal(false));
  }, [activeConv?.deal, activeConv?.latest_deal_id]);

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
        stage: dealDraft.stage,
        value: Number(dealDraft.value || 0),
        probability: Number(dealDraft.probability || 0),
        expected_close_date: dealDraft.expected_close_date || null,
        assigned_to: dealDraft.assigned_to || null,
      };
      const updated = await updateDeal(dealDetail.id, payload);
      setDealDetail(updated);
      setDealDraft({
        stage: updated.stage || "new_lead",
        value: updated.value ?? 0,
        probability: updated.probability ?? 0,
        expected_close_date: updated.expected_close_date || "",
        assigned_to: updated.assigned_to || "",
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
      <div className={`app-chat-layout ${dealPanelCollapsed ? "app-chat-layout-meta-collapsed" : ""}`}>
        <ChatSidebar
          loading={loadingList}
          conversations={filteredConversations}
          activeId={activeId}
          onSelect={selectConv}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          filters={filters}
          onApplyFilters={setFilters}
          onClearFilters={() =>
            setFilters({
              dealStage: "",
              dealOpenedFrom: "",
              dealOpenedTo: "",
              responsible: "",
            })
          }
          responsibleOptions={responsibleOptions}
        />
        <div className="app-chat-panel app-chat-center">
          {!activeId && (
            <p className="text-muted mb-0">Selecciona una conversación o abre desde un contacto.</p>
          )}
          {activeId && (
            <>
              <div className="app-chat-center-head">
                {canManageAiConfigs && (
                  <Form.Group className="mb-0" controlId="conv-ai-config">
                    <Form.Label className="small text-muted mb-1">
                      Configuración IA (esta conversación)
                    </Form.Label>
                    <Form.Select
                      size="sm"
                      value={aiConfigId || ""}
                      onChange={(e) => {
                        void handleAiConfigChange(e);
                      }}
                      disabled={savingAiConfig}
                      aria-busy={savingAiConfig}
                    >
                      <option value="">Predeterminada del sistema</option>
                      {aiConfigs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.is_default ? " (predeterminada)" : ""}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                )}
                {!canManageAiConfigs && activeConv?.ai_configuration_name && (
                  <p className="small text-muted mb-0">
                    Configuración IA: <strong>{activeConv.ai_configuration_name}</strong>
                  </p>
                )}
              </div>
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
                  senderLabel={senderLabel}
                  statusWarning={statusWarning}
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
            <Link to="/crm/contacts">← Volver al CRM</Link>
          </div>
        </div>
        <aside className="app-chat-panel app-chat-meta d-none d-lg-block">
          {activeConv ? (
            <>
              <div className="d-flex align-items-center justify-content-between mb-3">
                {!dealPanelCollapsed && <h3 className="h6 mb-0">Edición rápida del deal</h3>}
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  aria-label={dealPanelCollapsed ? "Expandir panel de deal" : "Colapsar panel de deal"}
                  title={dealPanelCollapsed ? "Expandir" : "Colapsar"}
                  onClick={() => setDealPanelCollapsed((prev) => !prev)}
                >
                  <i className={`bi ${dealPanelCollapsed ? "bi-chevron-left" : "bi-chevron-right"}`} />
                </button>
              </div>
              {dealPanelCollapsed ? (
                <div className="small text-muted">Deal</div>
              ) : (
                <>
              {loadingDeal && <p className="small text-muted mb-0">Cargando deal...</p>}
              {!loadingDeal && !dealDetail && (
                <div>
                  <p className="small text-muted mb-2">Este chat no tiene deal asociado.</p>
                  {activeConv.contact && (
                    <Link className="small" to={`/crm/contacts/${activeConv.contact}`}>
                      Ver contacto
                    </Link>
                  )}
                </div>
              )}
              {!loadingDeal && dealDetail && dealDraft && (
                <div className="d-flex flex-column gap-2">
                  <div className="small text-muted">Deal</div>
                  <div className="fw-semibold">{dealDetail.title}</div>
                  <Form.Group controlId="chat-deal-stage">
                    <Form.Label className="small text-muted mb-1">Etapa</Form.Label>
                    <Form.Select
                      size="sm"
                      value={dealDraft.stage}
                      onChange={(e) => handleDealDraftChange("stage", e.target.value)}
                      disabled={savingDeal}
                    >
                      {dealStages.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group controlId="chat-deal-value">
                    <Form.Label className="small text-muted mb-1">Valor</Form.Label>
                    <Form.Control
                      size="sm"
                      type="number"
                      min="0"
                      step="0.01"
                      value={dealDraft.value}
                      onChange={(e) => handleDealDraftChange("value", e.target.value)}
                      disabled={savingDeal}
                    />
                  </Form.Group>
                  <Form.Group controlId="chat-deal-probability">
                    <Form.Label className="small text-muted mb-1">Probabilidad (%)</Form.Label>
                    <Form.Control
                      size="sm"
                      type="number"
                      min="0"
                      max="100"
                      value={dealDraft.probability}
                      onChange={(e) => handleDealDraftChange("probability", e.target.value)}
                      disabled={savingDeal}
                    />
                  </Form.Group>
                  <Form.Group controlId="chat-deal-close-date">
                    <Form.Label className="small text-muted mb-1">Cierre estimado</Form.Label>
                    <Form.Control
                      size="sm"
                      type="date"
                      value={dealDraft.expected_close_date || ""}
                      onChange={(e) => handleDealDraftChange("expected_close_date", e.target.value)}
                      disabled={savingDeal}
                    />
                  </Form.Group>
                  <Form.Group controlId="chat-deal-assigned">
                    <Form.Label className="small text-muted mb-1">Responsable</Form.Label>
                    <Form.Select
                      size="sm"
                      value={dealDraft.assigned_to || ""}
                      onChange={(e) => handleDealDraftChange("assigned_to", e.target.value)}
                      disabled={savingDeal}
                    >
                      <option value="">Sin asignar</option>
                      {responsibleOptions.map((u) => (
                        <option key={u.id} value={u.id}>
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  {dealSaveError && (
                    <Alert variant="warning" className="py-2 px-3 small mb-0 mt-1">
                      {dealSaveError}
                    </Alert>
                  )}
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <Link className="small" to={`/crm/deals/${dealDetail.id}`}>
                      Abrir deal
                    </Link>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => {
                          void handleAdvanceDealStage();
                        }}
                        disabled={
                          savingDeal
                          || orderedStageKeys.indexOf(dealDraft.stage) < 0
                          || orderedStageKeys.indexOf(dealDraft.stage) >= orderedStageKeys.length - 1
                        }
                      >
                        Siguiente etapa
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          void handleSaveDealQuickEdit();
                        }}
                        disabled={savingDeal}
                      >
                        {savingDeal ? "Guardando..." : "Guardar cambios"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
            </>
          ) : (
            <p className="text-muted mb-0 small">Sin conversación seleccionada.</p>
          )}
        </aside>
      </div>
    </div>
  );
};

export default ChatView;
