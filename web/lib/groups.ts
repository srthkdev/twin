import type { BasketGroup } from "./types";

/** Groups are labelled in text; colour is reserved for data, so every group shares the muted ink. */
export const GROUPS: Record<BasketGroup, { label: string; short: string }> = {
  music: { label: "music", short: "mus" },
  fashion: { label: "fashion", short: "fsh" },
  food: { label: "food", short: "food" },
  nightlife: { label: "nightlife", short: "night" },
  film: { label: "film & tv", short: "film" },
  culture: { label: "culture", short: "cult" },
  lifestyle: { label: "lifestyle", short: "life" },
  sport: { label: "sport", short: "sport" },
};
export const groupOf = (g: string) => GROUPS[g as BasketGroup] ?? GROUPS.lifestyle;

export const CITY_CODES: Record<string, string> = {
  "los-angeles": "LA", "new-york": "NYC", london: "LDN", berlin: "BER", "mexico-city": "CDMX", paris: "PAR",
};
/** @deprecated use CITY_CODES */
export const CITY_FLAGS = CITY_CODES;
