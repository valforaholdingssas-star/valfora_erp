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
