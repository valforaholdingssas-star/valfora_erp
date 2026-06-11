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
  { bg: "#E8F1FF", text: "#0F3D91", border: "#B9D1FF" },
  { bg: "#EAFBF3", text: "#12633F", border: "#B9E8CC" },
  { bg: "#FFF4E8", text: "#9A4A00", border: "#FFD7AE" },
  { bg: "#F6ECFF", text: "#6B21A8", border: "#DEC7FF" },
  { bg: "#FFECEF", text: "#A61B3C", border: "#FFC5D2" },
  { bg: "#ECFDF5", text: "#047857", border: "#A7F3D0" },
  { bg: "#EEF2FF", text: "#3730A3", border: "#C7D2FE" },
  { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA" },
];

export const getAssigneeChipStyle = (label) => {
  const normalized = String(label || "sin asignar").trim().toLowerCase();
  if (!normalized || normalized === "sin asignar") {
    return { bg: "#F3F4F6", text: "#4B5563", border: "#D1D5DB" };
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return ASSIGNEE_CHIP_PALETTE[hash % ASSIGNEE_CHIP_PALETTE.length];
};
