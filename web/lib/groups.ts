import { Music, Shirt, Utensils, MoonStar, Clapperboard, Landmark, Sparkles, Trophy, type LucideIcon } from "lucide-react";
import type { BasketGroup } from "./types";

export const GROUPS: Record<BasketGroup, { label: string; icon: LucideIcon; color: string }> = {
  music: { label: "Music", icon: Music, color: "#a78bfa" },
  fashion: { label: "Fashion", icon: Shirt, color: "#f472b6" },
  food: { label: "Food", icon: Utensils, color: "#fbbf24" },
  nightlife: { label: "Nightlife", icon: MoonStar, color: "#818cf8" },
  film: { label: "Film & TV", icon: Clapperboard, color: "#fb7185" },
  culture: { label: "Culture", icon: Landmark, color: "#34d399" },
  lifestyle: { label: "Lifestyle", icon: Sparkles, color: "#22d3ee" },
  sport: { label: "Sport", icon: Trophy, color: "#fb923c" },
};
export const groupOf = (g: string) => GROUPS[g as BasketGroup] ?? GROUPS.lifestyle;

export const CITY_FLAGS: Record<string, string> = {
  "los-angeles": "LA", "new-york": "NYC", london: "LDN", berlin: "BER", "mexico-city": "CDMX", paris: "PAR",
};
