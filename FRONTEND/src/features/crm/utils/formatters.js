export const formatDealValue = (value) => {
  if (value === null || value === undefined || value === "") return "0";
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (Number.isNaN(parsed)) return String(value);
  const hasDecimals = Math.abs(parsed % 1) > 0;
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(parsed);
};

export const formatDealDisplayNumber = (dealId, index = null) => {
  if (typeof index === "number" && Number.isFinite(index)) {
    return `Deal #${String(index + 1).padStart(3, "0")}`;
  }
  if (!dealId) return "Deal";
  return `Deal #${String(dealId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
};

export const resolveUserDisplayName = (user) => {
  if (!user) return "";
  const firstName = (user.first_name || "").trim();
  const lastName = (user.last_name || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || user.email || user.username || "";
};

const ASSIGNEE_CHIP_PALETTE = [
  { bg: "#1D4ED8", text: "#FFFFFF", border: "#1E40AF" },
  { bg: "#0F766E", text: "#FFFFFF", border: "#115E59" },
  { bg: "#B45309", text: "#FFFFFF", border: "#92400E" },
  { bg: "#7C3AED", text: "#FFFFFF", border: "#6D28D9" },
  { bg: "#BE123C", text: "#FFFFFF", border: "#9F1239" },
  { bg: "#047857", text: "#FFFFFF", border: "#065F46" },
  { bg: "#4338CA", text: "#FFFFFF", border: "#3730A3" },
  { bg: "#C2410C", text: "#FFFFFF", border: "#9A3412" },
];

export const getAssigneeChipStyle = (label) => {
  const normalized = String(label || "sin asignar").trim().toLowerCase();
  if (!normalized || normalized === "sin asignar") {
    return { bg: "#E5E7EB", text: "#374151", border: "#CBD5E1" };
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return ASSIGNEE_CHIP_PALETTE[hash % ASSIGNEE_CHIP_PALETTE.length];
};
