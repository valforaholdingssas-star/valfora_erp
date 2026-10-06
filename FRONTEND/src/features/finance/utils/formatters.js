export const formatMoney = (value, currency = "COP") => {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency || "COP",
      maximumFractionDigits: currency === "COP" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
};

export const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export const STATUS_LABELS = {
  draft: "Borrador",
  pending_signature: "Pendiente firma",
  active: "Activo",
  completed: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
  sent: "Enviada",
  paid: "Pagada",
  partially_paid: "Pago parcial",
  overdue: "Vencida",
  void: "Anulada",
};
