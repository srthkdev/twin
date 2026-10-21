export const ROLES = [
  { id: "open", label: "open a place", title: "Pick a street for your next place.", body: "For cafés, bars and shops: compare local demand with the places already there.", question: "Where in Berlin should I open a natural wine bar?" },
  { id: "expand", label: "expand", title: "Take a working concept abroad.", body: "For founders and operators: find the twin of a neighbourhood where your concept already works.", question: "My café works in Shoreditch, London. Where in New York should I open the next one?" },
  { id: "move", label: "move", title: "Find your neighbourhood in a new city.", body: "For people relocating: match the place you love, then find the places you would go.", question: "I love Silver Lake, Los Angeles. I'm moving to Berlin. Which neighbourhood should I choose?" },
  { id: "tour", label: "tour", title: "Play where your audience is.", body: "For artists and promoters: pick cities, neighbourhoods and venues from local taste and demand.", question: "Where should Peso Pluma play in Europe? Compare London, Paris and Berlin for a three-city tour." },
] as const;

export function reportHref(question: string) {
  return `/explore?${new URLSearchParams({ view: "report", q: `Make me a report: ${question}` })}`;
}
