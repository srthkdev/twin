"use client";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

/** In-product guides (driver.js). A step points at data-tour="<target>" (or nothing, for a centred card) and may
 *  run an action while it is on screen, so the guide shows the feature instead of only naming it. */
interface Step { target?: string; title: string; body: string; action?: string; after?: string }

export const TOURS = {
  explore: [
    { title: "Twin in one minute", body: "Twin reads Qloo's taste data block by block and matches neighbourhoods across cities. Use it to decide where to open, expand, move or play. Six quick stops." },
    { target: "map", title: "A taste map", body: "Each column is a ~1 km block. The taller and brighter it is, the more that block shares the taste of the neighbourhood you picked." },
    { target: "map-mode", title: "Taste, not just busy", body: "Watch the map: this is plain popularity, which mostly shows busy streets. Taste takes busyness out, so what is left is what a block is actually into.", action: "mode:raw", after: "mode:twin" },
    { target: "tab-twins", title: "Its twins abroad", body: "The closest matches in other cities, with a % match and what they share. Click one and the map flies there.", action: "tab:twins" },
    { target: "reports", title: "Ask for a decision", body: "Pick one of these and the agent pulls live Qloo, map and web data, then writes a report: a verdict, charts, places on the map and a PDF.", action: "tab:agent" },
    { target: "ask", title: "Or ask anything", body: "Plain questions work too: the vibe of a neighbourhood, a twin, an artist's audience. Replay this guide any time from \"guide\"." },
  ],
  report: [
    { target: "verdict", title: "The decision first", body: "GO, WATCH or SKIP with one line on why. Every number in this report was checked against the data the agent pulled; numbers it could not trace were rejected." },
    { target: "places", title: "Places fly the map", body: "Neighbourhoods and venues are links. Click one and the map goes there." },
    { target: "pdf", title: "Take it with you", body: "Download a PDF or copy a share link. The link works for anyone." },
    { target: "baseline", title: "Twin vs a plain AI", body: "Ask a model without Twin's tools the same question. Each place it names is checked: many can't be found or are in the wrong city." },
    { target: "evidence", title: "How this was made", body: "Every tool call behind the report, in order, and which source answered it." },
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
  const first = steps.find((s) => s.target)!.target!;
  if (!(await whenPresent(sel(first)))) return;
  await new Promise((r) => setTimeout(r, delay));
  const present = steps.filter((s) => !s.target || document.querySelector(sel(s.target)));
  if (!present.some((s) => s.target)) return;
  const act = (a?: string) => !!a && window.dispatchEvent(new CustomEvent("twin:tour-action", { detail: a }));
  // An action can reveal its target (a tab), so re-measure once React has painted it.
  const tour = driver({
    steps: present.map((s) => ({
      element: s.target ? sel(s.target) : undefined,
      popover: { title: s.title, description: s.body },
      onHighlightStarted: () => { if (act(s.action)) requestAnimationFrame(() => requestAnimationFrame(() => tour.refresh())); },
      onDeselected: () => act(s.after),
    })),
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
  });
  tour.drive();
}
