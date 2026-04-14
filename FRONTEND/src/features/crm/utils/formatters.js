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

