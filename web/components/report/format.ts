/** Taste scores (demand, over-index, lift, relative …) read as words, never raw decimals. */
export const isDemandUnit = (unit?: string) => /\b(score|demand|over-?index(ed)?|lift|relative|z)\b/i.test(unit?.trim() ?? "");

export function chartValue(value: number, unit?: string) {
  const u = unit?.trim().toLowerCase() ?? "";
  if (isDemandUnit(u)) return value >= 2 ? "very strong" : value >= 1 ? "strong" : value > 0 ? "above average" : value === 0 ? "average" : "limited";
  if (/^(%|percent|percentage|match)$/.test(u)) {
    const percent = u === "match" && Math.abs(value) <= 1 ? value * 100 : value;
    return `${percent.toLocaleString("en", { maximumFractionDigits: 1 })}%`;
  }
  const count = !u || /venues?|places?|counts?|bars?|restaurants?|people|fans|shops?|clubs?|caf[eé]s?/.test(u);
  return `${value.toLocaleString("en", { maximumFractionDigits: count ? 0 : 1 })}${u ? ` ${unit}` : ""}`;
}
