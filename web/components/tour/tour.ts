"use client";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

/** Short in-product guides (driver.js). Each step points at an element marked data-tour="<target>". */
interface Step { target: string; title: string; body: string }

export const TOURS = {
  explore: [
    { target: "ask", title: "Ask for a decision", body: "Where to open, where to move, where an artist should play. Ask for a report to get a verdict, charts and a PDF." },
    { target: "view", title: "Report or map", body: "Report puts the agent first with the map docked beside it. Map is the full-screen explorer." },
    { target: "map-mode", title: "Taste, not just busy", body: "Popularity is how busy a block is. Taste takes that out, so what's left is what the block is actually into." },
  ],
  report: [
    { target: "verdict", title: "The decision first", body: "GO, WATCH or SKIP with one line on why. Every number in the report was checked against the data the agent pulled." },
    { target: "places", title: "Places fly the map", body: "Neighbourhoods and venues are links. Click one and the map goes there." },
    { target: "evidence", title: "How this was made", body: "Every tool call behind the report, in order, and which source answered it. The PDF is one click at the top." },
  ],
} satisfies Record<string, Step[]>;
export type TourName = keyof typeof TOURS;

const KEY = "twin-tour-v1";
const seenAll = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } };
const markSeen = (name: TourName) => { try { localStorage.setItem(KEY, JSON.stringify({ ...seenAll(), [name]: true })); } catch { /* storage blocked */ } };
const sel = (t: string) => `[data-tour="${t}"]`;

/** Resolves once the first step's element is on the page (or after `ms`), without polling. */
function whenPresent(selector: string, ms = 20_000) {
  return new Promise<boolean>((done) => {
    if (document.querySelector(selector)) return done(true);
    const mo = new MutationObserver(() => { if (document.querySelector(selector)) { mo.disconnect(); clearTimeout(t); done(true); } });
    const t = setTimeout(() => { mo.disconnect(); done(false); }, ms);
    mo.observe(document.body, { childList: true, subtree: true });
  });
}

/**
 * Run a guide. Without `force` it runs once per browser. Clicking outside, Esc or ✕ closes it, and the page under it
 * stays usable — it should never be in the way.
 */
export async function runTour(name: TourName, { force = false, delay = 600 } = {}) {
  if (!force && seenAll()[name]) return;
  const steps: Step[] = TOURS[name];
  if (!(await whenPresent(sel(steps[0].target)))) return;
  await new Promise((r) => setTimeout(r, delay));
  const present = steps.filter((s) => document.querySelector(sel(s.target)));
  if (!present.length) return;
  driver({
    steps: present.map((s) => ({ element: sel(s.target), popover: { title: s.title, description: s.body } })),
    showProgress: present.length > 1,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "next",
    prevBtnText: "back",
    doneBtnText: "done",
    overlayOpacity: 0.35,
    overlayClickBehavior: "close",
    stagePadding: 5,
    stageRadius: 0,
    smoothScroll: true,
    popoverClass: "twin-tour",
    onDestroyed: () => markSeen(name),
  }).drive();
}
