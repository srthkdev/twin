"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWRImmutable from "swr/immutable";
import { useEventCallback, useEventListener } from "usehooks-ts";
import { useSearchParams } from "next/navigation";
import { useDataset } from "@/hooks/use-dataset";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePanel } from "@/hooks/use-panel";
import { usePairs, type Pair } from "@/hooks/use-pairs";
import { coreHoods, isLive, loadCells, loadCore, loadEvals } from "@/lib/data";
import { cellSimilarities, neighbourhoodVector, rankHoods } from "@/lib/similarity";
import { gradientCss } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { City, DataSet, Hood, OpportunityResult, TwinMatch } from "@/lib/types";
import type { AgentAction } from "@/lib/agent/types";
import type { BlockInfo, Mode, MapTwin } from "@/components/map/explore-map";
import { MIX } from "@/components/map/mix";
import { ModeToggle } from "./mode-toggle";
import { SourcePanel, type SourcePin } from "./source-panel";
import { TwinsPanel } from "./twins-panel";
import { CommandPalette } from "./command-palette";
import { AgentPanel } from "@/components/agent/agent-panel";
import { runTour } from "@/components/tour/tour";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

const ExploreMap = dynamic(() => import("@/components/map/explore-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-background text-[12px] text-dim">loading globe…</div>,
});

const DEFAULT_FROM = "los-angeles-silver-lake";

type RightTab = "twins" | "agent";
type MobileTab = "from" | RightTab;
type ExploreView = "map" | "report";
interface ExploreLocation { fromId: string; toCity: string | null; view: ExploreView; reportId: string | null }

function syncLocation({ fromId, toCity, view, reportId }: ExploreLocation) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries({ from: fromId, to: toCity, view: view === "report" ? view : null, report: reportId })) {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url.toString());
}

async function loadCores([, ...ids]: string[]) {
  return Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await loadCore(id)] as const)));
}

export function ExploreClient() {
  const sp = useSearchParams();
  const { ds: baseDs, error, refresh } = useDataset();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [location, setLocation] = useState<ExploreLocation>(() => ({
    fromId: sp.get("from") ?? DEFAULT_FROM, toCity: sp.get("to"),
    view: sp.get("view") === "report" ? "report" : "map", reportId: sp.get("report"),
  }));
  const { fromId, toCity, view, reportId } = location;
  const locationRef = useRef(location);
  const changeLocation = useEventCallback((patch: Partial<ExploreLocation>) => {
    const next = { ...locationRef.current, ...patch };
    locationRef.current = next;
    setLocation(next);
    if (baseDs) syncLocation(next);
  });
  const [pin, setPin] = useState<SourcePin | null>(null);
  const [mode, setMode] = useState<Mode>("twin");
  const { data: evals = null, error: evalError } = useSWRImmutable("/data/evals.json", loadEvals, { shouldRetryOnError: false });
  const [cmdOpen, setCmdOpen] = useState(false);
  const [flying, setFlying] = useState(false);
  const [right, setRight] = useState<RightTab>(sp.get("tab") === "agent" || sp.get("q") || sp.get("view") === "report" ? "agent" : "twins");
  // The guide demonstrates instead of only pointing: it can flip the map mode and open a tab while it explains them.
  useEventListener("twin:tour-action" as keyof WindowEventMap, (e) => {
    const [kind, value] = String((e as CustomEvent).detail).split(":");
    if (kind === "mode") setMode(value as Mode);
    if (kind === "tab") { setRight(value as RightTab); setMobileTab(value as MobileTab); }
  });
  const [sourceOpen, setSourceOpen] = useState(false);
  const leftP = usePanel("left", 300, 220, 460, "left");
  const rightP = usePanel("right", 400, 320, 680, "right");
  const setRightCollapsed = rightP.setCollapsed;
  const [ask, setAsk] = useState<BlockInfo | null>(null);
  const [external, setExternal] = useState<{ text: string; t: number } | null>(null);
  const [agentFocus, setAgentFocus] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; label?: string; t: number } | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>(sp.get("q") || sp.get("tab") === "agent" || sp.get("view") === "report" ? "agent" : "from");
  const [opp, setOpp] = useState<OpportunityResult | null>(null);

  useEffect(() => { void runTour("explore", { delay: 1200 }); }, []);
  useEffect(() => { if (baseDs) syncLocation(locationRef.current); }, [baseDs]);

  // Live cities only have the 40 core dims, so any pair that includes one is compared on core vectors on both sides.
  const rawHood = baseDs?.hoods.find((h) => h.id === fromId) ?? baseDs?.hoods[0] ?? null;
  const sourceCityId = pin?.city ?? rawHood?.city ?? "";
  const srcLive = isLive(baseDs?.cities.find((c) => c.id === sourceCityId));
  const tgtLive = isLive(toCity ? baseDs?.cities.find((c) => c.id === toCity) : null);
  const coreMode = srcLive || tgtLive;
  const coreIds = useMemo(() => (coreMode ? [sourceCityId, toCity].filter((x): x is string => !!x) : []), [coreMode, sourceCityId, toCity]);
  const { data: cores, error: coreError } = useSWRImmutable(coreIds.length ? ["twin:cores", ...coreIds] : null, loadCores, { shouldRetryOnError: false });
  const coreReady = coreMode && !!cores;

  const ds: DataSet | null = useMemo(() => {
    if (!baseDs) return null;
    if (!coreMode) return baseDs;
    const hoods = coreReady && cores ? coreIds.flatMap((id) => coreHoods(cores[id], id)) : baseDs.hoods;
    return { ...baseDs, basket: coreReady || srcLive ? (baseDs.coreBasket ?? baseDs.basket) : baseDs.basket, hoods, twins: {} };
  }, [baseDs, coreMode, coreReady, coreIds, cores, srcLive]);

  const sourceHood: Hood | null = useMemo(() => ds?.hoods.find((h) => h.id === fromId) ?? ds?.hoods[0] ?? null, [ds, fromId]);
  const sourceCity = ds?.cities.find((c) => c.id === sourceCityId) ?? null;
  const targetCity = toCity ? ds?.cities.find((c) => c.id === toCity) ?? null : null;
  const oppCity = opp ? ds?.cities.find((c) => c.id === opp.city) ?? null : null;

  const { data: srcCells = null, error: srcError } = useSWRImmutable(sourceCityId ? ["twin:cells", sourceCityId, coreMode] as const : null,
    ([, id, core]) => loadCells(id, core), { shouldRetryOnError: false });
  const { data: tgtCells = null, error: tgtError } = useSWRImmutable(toCity ? ["twin:cells", toCity, coreMode] as const : null,
    ([, id, core]) => loadCells(id, core), { shouldRetryOnError: false });

  // A dropped pin keeps only its location; its vector is re-derived from whichever cells (116 or 40 dims) are loaded.
  const livePin: SourcePin | null = useMemo(() => {
    if (!pin) return null;
    if (!srcCells || srcCells.city !== pin.city) return { ...pin, vec: [], top: [] };
    const vec = neighbourhoodVector(srcCells, pin.lon, pin.lat);
    return { ...pin, vec, top: vec.map((x, k) => [x, k] as const).sort((a, b) => b[0] - a[0]).slice(0, 7).map((x) => x[1]) };
  }, [pin, srcCells]);
  const sourceVec = livePin ? (livePin.vec.length ? livePin.vec : null) : sourceHood?.v ?? null;

  const srcSim = useMemo(() => (srcCells && sourceVec && sourceVec.length === srcCells.dim ? cellSimilarities(srcCells, sourceVec) : null), [srcCells, sourceVec]);
  const tgtSim = useMemo(() => (tgtCells && sourceVec && sourceVec.length === tgtCells.dim ? cellSimilarities(tgtCells, sourceVec) : null), [tgtCells, sourceVec]);

  const matches: TwinMatch[] = useMemo(() => {
    if (!ds || !toCity || !sourceVec) return [];
    if (!pin && !coreMode) { const pre = ds.twins[fromId]?.[toCity]; if (pre?.length) return pre.slice(0, 5); }
    return rankHoods(sourceVec, ds.hoods, toCity, 5);
  }, [ds, toCity, sourceVec, pin, fromId, coreMode]);

  const [selection, setSelection] = useState<{ matches: TwinMatch[]; id: string | null } | null>(null);
  const selected = selection?.matches === matches ? selection.id : matches[0]?.hood ?? null;
  const setSelected = useEventCallback((id: string | null) => setSelection({ matches, id }));

  const mapTwins: MapTwin[] = useMemo(
    () => (ds ? matches.map((m) => ({ hood: ds.hoods.find((h) => h.id === m.hood)!, score: m.score })).filter((t) => t.hood) : []),
    [ds, matches],
  );

  const pickHood = useCallback((id: string) => {
    setPin(null); setSourceOpen(false);
    changeLocation({ fromId: id, toCity: toCity && ds?.hoods.find((h) => h.id === id)?.city === toCity ? null : toCity });
  }, [ds, toCity, changeLocation]);
  const { recent, popular, visit, error: pairsError } = usePairs();
  const pickPair = useCallback((p: Pair) => { setPin(null); changeLocation({ fromId: p.from, toCity: p.to }); setSourceOpen(false); }, [changeLocation]);
  // every pair someone actually opens feeds "recent" (this browser) and "most opened" (everyone)
  useEffect(() => {
    if (!pin && toCity && ds?.hoods.some((h) => h.id === fromId)) visit(fromId, toCity);
  }, [fromId, toCity, pin, ds, visit]);
  const pickCity = useCallback((id: string | null) => {
    changeLocation({ toCity: id });
    if (view === "report") { setSourceOpen(false); setRight("agent"); setMobileTab("agent"); }
    else if (id) { setRight("twins"); setMobileTab("twins"); }
  }, [view, changeLocation]);

  const onPickSourceCell = useCallback((i: number) => {
    if (!srcCells || !ds) return;
    const lon = srcCells.lon[i], lat = srcCells.lat[i];
    const near = ds.hoods.filter((h) => h.city === srcCells.city)
      .map((h) => ({ h, d: Math.hypot((h.lon - lon) * Math.cos((lat * Math.PI) / 180), h.lat - lat) })).sort((a, b) => a.d - b.d)[0]?.h;
    setPin({ kind: "pin", city: srcCells.city, lon, lat, vec: [], top: [], label: `cell ${srcCells.g[i]}${near ? ` near ${near.name}` : ""}` });
    setMobileTab("from");
  }, [srcCells, ds]);

  const swap = useCallback(() => {
    if (!ds || !toCity) return;
    const target = selected ?? matches[0]?.hood;
    if (!target) return;
    const back = sourceCityId;
    setPin(null); changeLocation({ fromId: target, toCity: back });
  }, [ds, toCity, selected, matches, sourceCityId, changeLocation]);

  const cityAdded = useCallback((city: City) => {
    void refresh().then(() => {
      if (city.id !== sourceCityId) changeLocation({ toCity: city.id }); // the agent moves the map, never the panel away from the chat
    });
  }, [refresh, sourceCityId, changeLocation]);
  const userAddedCity = useCallback((city: City) => {
    void refresh().then(() => { if (city.id !== sourceCityId) pickCity(city.id); });
  }, [refresh, sourceCityId, pickCity]);

  const changeView = useCallback((next: ExploreView, id?: string) => {
    changeLocation({ view: next, ...(id !== undefined ? { reportId: id } : {}) });
    setSourceOpen(false);
    if (next === "report") { setRight("agent"); setMobileTab("agent"); setRightCollapsed(false); }
  }, [setRightCollapsed, changeLocation]);
  useEffect(() => { if (view === "report") setRightCollapsed(false); }, [view, setRightCollapsed]);

  const onAgentAction = useCallback((act: AgentAction) => {
    if (!ds) return;
    // addCity / opportunity come from the v2 backend; typed locally so this compiles either way.
    const a = act as AgentAction | { type: "addCity"; city: City } | { type: "opportunity"; city: string; cells: OpportunityResult["cells"] };
    // the opportunity paint belongs to one answer; any other map move returns to the taste map
    if (a.type === "addCity" || a.type === "select" || a.type === "showTwins") setMode((m) => (m === "opportunity" ? "twin" : m));
    if (a.type === "addCity") {
      cityAdded(a.city);
    } else if (a.type === "opportunity") {
      if (!ds.cities.some((c) => c.id === a.city)) void refresh();
      setOpp({ city: a.city, cells: a.cells });
      setMode("opportunity");
      if (a.city !== sourceCityId) changeLocation({ toCity: a.city });
    } else if (a.type === "select" || a.type === "showTwins") {
      setPin(null); changeLocation({ fromId: a.from, toCity: a.to });
      if (a.twin) setTimeout(() => setSelected(a.twin!), 60);
    } else if (a.type === "focus") {
      // a place in another fingerprinted city: show that city's blocks too
      const near = ds.cities.map((c) => ({ c, d: Math.hypot(c.center[0] - a.lon, c.center[1] - a.lat) })).sort((x, y) => x.d - y.d)[0];
      if (near && near.d < 0.8 && near.c.id !== toCity && near.c.id !== sourceCityId) {
        setMode((m) => (m === "opportunity" ? "twin" : m)); changeLocation({ toCity: near.c.id });
      }
      setFocus({ lat: a.lat, lon: a.lon, label: a.label, t: Date.now() });
    } else if (a.type === "focusHood") {
      const h = ds.hoods.find((x) => x.id === a.hood);
      if (h) { setFocus({ lat: h.lat, lon: h.lon, label: a.label ?? h.name, t: Date.now() }); return; }
      const city = ds.cities.find((c) => a.hood.startsWith(c.id + "-"));
      if (city) loadCore(city.id).then((core) => {
        const lh = core?.hoods.find((x) => x.id === a.hood);
        if (lh) setFocus({ lat: lh.lat, lon: lh.lon, label: a.label ?? lh.name, t: Date.now() });
      }).catch(() => {});
    } else if (a.type === "report") {
      void runTour("report");
      changeView("report", a.id);
    } else if (a.type === "flyTo") {
      const h = ds.hoods.find((x) => x.id === a.hood);
      if (!h) return;
      if (h.city === toCity) setSelected(h.id); else { setPin(null); changeLocation({ fromId: h.id }); }
    } else if (a.type === "highlightCells") {
      // Show where the item clusters: make the strongest neighbourhood for it the source.
      const best = ds.hoods.filter((h) => h.city === a.city).sort((x, y) => (y.v[a.item] ?? 0) - (x.v[a.item] ?? 0))[0];
      if (best) { setPin(null); changeLocation({ fromId: best.id, toCity: toCity === a.city ? null : toCity }); }
    }
  }, [ds, toCity, sourceCityId, cityAdded, refresh, changeView, changeLocation, setSelected]);

  const focusQueryHandled = useRef(false);
  useEffect(() => {
    if (!ds || focusQueryHandled.current) return;
    const requested = sp.get("focus");
    if (!requested) return;
    focusQueryHandled.current = true;
    if (requested.startsWith("geo:")) {
      const [lat, lon] = requested.slice(4).split(",").map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) setFocus({ lat, lon, t: Date.now() });
    } else if (requested.startsWith("hood:")) {
      onAgentAction({ type: "focusHood", hood: requested.slice(5) });
    }
  }, [ds, sp, onAgentAction]);

  const dataError = coreError || srcError || tgtError || evalError || pairsError;
  if (error) return <div className="grid min-h-dvh place-items-center text-destructive">failed to load data: {error}</div>;
  if (!ds || !sourceHood || !sourceVec) {
    return <div className="grid min-h-dvh place-items-center text-[12px] text-dim"><span className={cn(!dataError && "cursor-block")}>{dataError ? "Some taste data could not be loaded." : "loading taste data"}</span></div>;
  }

  const sourcePoint = { lon: pin?.lon ?? sourceHood.lon, lat: pin?.lat ?? sourceHood.lat, name: pin ? "pin" : sourceHood.name, cityId: sourceCityId };
  const sourceName = pin ? "your pin" : sourceHood.name;

  const sourceUI = <SourcePanel ds={ds} source={sourceHood} pin={livePin} toCity={toCity} sourceCityId={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} onPickPair={pickPair} onCityAdded={userAddedCity} recent={recent} popular={popular} />;
  const twinsUI = targetCity ? (
    <TwinsPanel ds={ds} matches={matches} selected={selected} onSelect={setSelected} sourceName={sourceName} targetName={targetCity.name} mode={mode} onSwap={swap} evals={evals} />
  ) : (
    <div className="px-4 py-6 text-[12px] leading-relaxed text-muted-foreground">
      <div className="label mb-2">twins</div>
      pick a city under <span className="text-foreground">twin in</span> — the camera flies there and the five closest neighbourhoods
      to <span className="text-foreground">{sourceName.toLowerCase()}</span> light up.
    </div>
  );
  const agentUI = <AgentPanel context={{ fromHood: pin ? null : fromId, toCity, focus: agentFocus }} onAction={onAgentAction} className="h-full"
    initialInput={sp.get("q") ?? undefined} external={external} view={view} reportId={reportId} onViewChange={changeView} />;
  const askAgent = (b: BlockInfo, question: string) => {
    const where = `${b.near ? `near ${b.near}` : "a block"}, ${ds.cities.find((c) => c.id === b.city)?.name ?? b.city}`;
    setAgentFocus({ lat: b.lat, lon: b.lon, label: where });
    setExternal({ text: `${question} — ${where}`, t: Date.now() });
    setRight("agent"); setMobileTab("agent"); rightP.setCollapsed(false);
    setAsk(null);
  };

  const map = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <ExploreMap
        source={sourcePoint} sourceCity={sourceCity} targetCity={targetCity} srcCells={srcCells} tgtCells={tgtCells}
        srcSim={srcSim} tgtSim={tgtSim} mode={mode} twins={mapTwins} selectedTwin={selected} basketLabels={ds.basket.map((b) => b.label)} opportunity={opp} opportunityCity={oppCity}
        onPickSourceCell={onPickSourceCell} onSelectTwin={setSelected} onFlightState={setFlying} focus={focus}
        basketGroups={ds.basket.map((b) => b.group)} hoods={ds.hoods} sourceName={sourceName} onBlockClick={setAsk} quiet={!!ask}
      />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto"><ModeToggle mode={mode} onChange={setMode} hasOpportunity={!!opp} /></div>
        <div className="border border-line bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
          {flying ? <span className="cursor-block">flying to {targetCity?.name.toLowerCase()}</span>
            : mode === "opportunity" ? <span>{oppCity?.name.toLowerCase()} <span className="text-dim">·</span> demand without <span className="text-foreground">supply</span></span>
            : mode === "raw" ? <span>raw affinity — mostly <span className="text-foreground">how busy</span> a cell is</span>
              : <span>{sourceCity?.name.toLowerCase()}{targetCity ? <> <span className="text-dim">→</span> {targetCity.name.toLowerCase()}</> : ""}</span>}
        </div>
      </div>
      {dataError && <p role="status" className="absolute left-3 top-14 z-10 border border-line bg-background/90 px-2 py-1 text-[11px] text-destructive">Some taste data could not be loaded.</p>}
      {ask && <AskBox block={ask} sourceName={sourceName} onClose={() => setAsk(null)} onAsk={(q) => askAgent(ask, q)}
        onUseAsSource={ask.isSource ? () => { onPickSourceCell(ask.index); setAsk(null); } : undefined} />}
      {mode === "twin" ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 border border-line bg-background/90 px-2.5 py-1.5 text-[10.5px] text-dim">
          <div>height — how much like {sourceName.toLowerCase()} · colour — what the block is mostly about</div>
          <div className="mt-1 flex items-center gap-3">
            {MIX.map((m) => <span key={m.name} className="flex items-center gap-1"><span className="size-2" style={{ background: `rgb(${m.rgb.join(",")})` }} />{m.name}</span>)}
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 border border-line bg-background/90 px-2 py-1 text-[10.5px] text-dim">
          <span>{mode === "raw" ? "quiet" : "saturated"}</span>
          <span className="h-1.5 w-28" style={{ background: gradientCss(mode === "raw" ? "raw" : "opp") }} />
          <span>{mode === "raw" ? "busy" : "underserved"}</span>
        </div>
      )}
    </div>
  );

  const tabBtn = (id: string, label: string, active: boolean, onClick: () => void, disabled = false) => (
    <button key={id} role="tab" data-tour={`tab-${id}`} aria-selected={active} disabled={disabled} onClick={onClick}
      className={cn("relative h-full px-4 text-[12px] transition-colors disabled:opacity-40", active ? "text-foreground" : "text-dim hover:text-muted-foreground")}>
      {label}
      {active && <span className="absolute inset-x-3 -bottom-px h-px bg-primary" />}
    </button>
  );

  return (
    <main className="fixed inset-x-0 bottom-0 top-11 bg-background">
      {desktop ? (
        <div className="relative flex h-full min-w-0">
          {leftP.collapsed || view === "report" ? (
            <Rail label="from" side="left" onOpen={() => view === "report" ? setSourceOpen(true) : leftP.setCollapsed(false)} />
          ) : (
            <aside className="relative flex min-h-0 shrink-0 flex-col border-r border-line" style={{ width: leftP.width }} aria-label="Source neighbourhood">
              <button onClick={() => leftP.setCollapsed(true)} aria-label="Collapse panel" title="collapse"
                className="absolute right-1.5 top-1.5 z-10 grid size-6 place-items-center text-dim transition-colors hover:text-foreground">‹</button>
              <div className="min-h-0 flex-1 overflow-hidden">{sourceUI}</div>
              <Handle side="right" {...leftP.handle} />
            </aside>
          )}
          <div data-tour="map" className="relative min-h-0 min-w-0 flex-1 overflow-hidden">{map}</div>
          {rightP.collapsed && view !== "report" ? (
            <Rail label={right === "agent" ? "agent" : "twins"} side="right" onOpen={() => rightP.setCollapsed(false)} />
          ) : (
            // Reports widen this panel; the map stays put on the left, so there is one layout to learn.
            <aside className="relative flex min-h-0 shrink-0 flex-col border-l border-line transition-[width] duration-300 ease-out"
              style={{ width: view === "report" ? "min(64vw, 1180px)" : rightP.width }} aria-label="Twins and agent">
              {view === "map" && <Handle side="left" {...rightP.handle} />}
              <div role="tablist" className="flex h-10 shrink-0 items-stretch border-b border-line">
                {tabBtn("twins", "twins", right === "twins", () => setRight("twins"))}
                {tabBtn("agent", "agent", right === "agent", () => setRight("agent"))}
                <button onClick={() => setCmdOpen(true)} className="ml-auto px-3 text-[11.5px] text-dim transition-colors hover:text-foreground" aria-label="Open search (Command K)">
                  search <span className="ml-1 text-line-strong">⌘K</span>
                </button>
                {view === "map" && <button onClick={() => rightP.setCollapsed(true)} aria-label="Collapse panel" title="collapse" className="px-3 text-dim transition-colors hover:text-foreground">›</button>}
              </div>
              <div className={cn("min-h-0 flex-1 overflow-y-auto", right !== "twins" && "hidden")}>{twinsUI}</div>
              <div className={cn("min-h-0 flex-1", right !== "agent" && "hidden")}>
                <div className={cn("h-full", view === "report" && "mx-auto w-full max-w-[940px]")}>{agentUI}</div>
              </div>
            </aside>
          )}
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className={cn("shrink-0 border-b border-line", view === "report" ? "h-[28dvh]" : "h-[42dvh]")}>{map}</div>
          <div role="tablist" className="flex h-10 shrink-0 items-stretch border-b border-line">
            {tabBtn("from", "from", mobileTab === "from", () => view === "report" ? setSourceOpen(true) : setMobileTab("from"))}
            {tabBtn("twins", "twins", mobileTab === "twins", () => setMobileTab("twins"), !targetCity)}
            {tabBtn("agent", "agent", mobileTab === "agent", () => setMobileTab("agent"))}
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", mobileTab !== "from" && "hidden")}>{sourceUI}</div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", mobileTab !== "twins" && "hidden")}>{twinsUI}</div>
          <div className={cn("min-h-0 flex-1", mobileTab !== "agent" && "hidden")}>{agentUI}</div>
        </div>
      )}
      <Sheet open={sourceOpen && view === "report"} onOpenChange={setSourceOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 border-line-strong bg-background p-0 data-[side=left]:w-[min(90vw,380px)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <SheetTitle className="label text-[10.5px]">From / source neighbourhood</SheetTitle>
            <SheetClose className="text-[11px] text-dim hover:text-foreground">Close</SheetClose>
          </div>
          <SheetDescription className="sr-only">Choose the source neighbourhood and destination city for your report.</SheetDescription>
          <div className="min-h-0 flex-1 overflow-hidden">{sourceUI}</div>
        </SheetContent>
      </Sheet>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} ds={ds} sourceCity={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} />
    </main>
  );
}

/** Drag strip on a panel edge; widens on hover so it's easy to grab. */
function Handle({ side, ...h }: { side: "left" | "right" } & ReturnType<typeof usePanel>["handle"]) {
  return (
    <div {...h} role="separator" aria-orientation="vertical" aria-label="Resize panel"
      className={cn("group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none", side === "right" ? "-right-1" : "-left-1")}>
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary group-active:bg-primary" />
    </div>
  );
}

/** A collapsed panel: a thin rail with a vertical label that reopens it. */
function Rail({ label, side, onOpen }: { label: string; side: "left" | "right"; onOpen: () => void }) {
  return (
    <button onClick={onOpen} aria-label={`Open ${label} panel`}
      className={cn("flex w-8 shrink-0 flex-col items-center gap-3 bg-background py-3 text-[11px] text-dim transition-colors hover:text-foreground", side === "left" ? "border-r border-line" : "border-l border-line")}>
      <span>{side === "left" ? "›" : "‹"}</span>
      <span className="[writing-mode:vertical-rl]">{label}</span>
    </button>
  );
}

/** ⌘K-style box anchored on a clicked block: ask the agent about exactly this spot. */
function AskBox({ block, sourceName, onClose, onAsk, onUseAsSource }: {
  block: BlockInfo; sourceName: string; onClose: () => void; onAsk: (q: string) => void; onUseAsSource?: () => void;
}) {
  const [q, setQ] = useState("");
  useEventListener("keydown", (e) => { if (e.key === "Escape") onClose(); });
  const quick = ["What's the vibe here?", "Where should I go here?", "What would do well here?"];
  return (
    <div className="absolute z-30 w-[290px] border border-line-strong bg-popover shadow-[0_8px_30px_rgba(0,0,0,.5)]"
      style={{ left: Math.max(8, Math.min(block.x + 14, 9999)), top: Math.max(8, block.y - 20) }}>
      <div className="flex items-center justify-between border-b border-line px-2.5 py-1.5 text-[10.5px] uppercase tracking-[0.12em] text-dim">
        <span className="truncate">{block.near || "this block"}{block.match != null && block.match >= 0.15 && <span className="ml-2 normal-case tracking-normal text-primary">{Math.round(block.match * 100)}% like {sourceName.toLowerCase()}</span>}</span>
        <button onClick={onClose} aria-label="Close" className="ml-2 text-dim hover:text-foreground">esc</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim()); }} className="flex items-center gap-2 border-b border-line px-2.5 py-2">
        <span className="text-primary">›</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ask about this block…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-dim" />
      </form>
      <div className="py-1">
        {quick.map((x) => (
          <button key={x} onClick={() => onAsk(x)} className="block w-full px-2.5 py-1 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground">{x}</button>
        ))}
        {onUseAsSource && (
          <button onClick={onUseAsSource} className="block w-full border-t border-line px-2.5 py-1.5 text-left text-[11.5px] text-primary transition-colors hover:bg-raised">use this block as the source →</button>
        )}
      </div>
    </div>
  );
}
