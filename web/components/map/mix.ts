/** The three bands of a map block: what that block's distinctive taste is made of. */
export const MIX = [
  { name: "sound", rgb: [240, 160, 60] as const },   // music
  { name: "table", rgb: [230, 227, 218] as const },  // food
  { name: "scene", rgb: [176, 92, 48] as const },    // nightlife, fashion, culture, film, sport, lifestyle
];
export const mixOf = (group: string) => (group === "music" ? 0 : group === "food" ? 1 : 2);
