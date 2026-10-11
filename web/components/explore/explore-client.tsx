"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDataset } from "@/hooks/use-dataset";
import { useMediaQuery } from "@/hooks/use-media-query";
import { loadCells, loadEvals } from "@/lib/data";
import { cellSimilarities, neighbourhoodVector, rankHoods } from "@/lib/similarity";
import { gradientCss } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { Evals, Hood, PackedCells, TwinMatch } from "@/lib/types";
import type { AgentAction } from "@/lib/agent/types";
import type { Mode, MapTwin } from "@/components/map/explore-map";
import { ModeToggle } from "./mode-toggle";
import { SourcePanel, type SourcePin } from "./source-panel";
import { TwinsPanel } from "./twins-panel";
import { CommandPalette } from "./command-palette";
import { AgentPanel } from "@/components/agent/agent-panel";

const ExploreMap = dynamic(() => import("@/components/map/explore-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-background text-[12px] text-dim">loading globe…</div>,
});

const DEFAULT_FROM = "los-angeles-silver-lake";
type RightTab = "twins" | "agent";
type MobileTab = "from" | RightTab;

export function ExploreClient() {
  const sp = useSearchParams();
  const { ds, error } = useDataset();
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const [fromId, setFromId] = useState(sp.get("from") ?? DEFAULT_FROM);
  const [toCity, setToCity] = useState<string | null>(sp.get("to"));
  const [pin, setPin] = useState<SourcePin | null>(null);
  const [mode, setMode] = useState<Mode>("twin");
  const [selected, setSelected] = useState<string | null>(null);
  const [srcCells, setSrcCells] = useState<PackedCells | null>(null);
  const [tgtCells, setTgtCells] = useState<PackedCells | null>(null);
  const [evals, setEvals] = useState<Evals | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [flying, setFlying] = useState(false);
  const [right, setRight] = useState<RightTab>(sp.get("tab") === "agent" ? "agent" : "twins");
  const [mobileTab, setMobileTab] = useState<MobileTab>("from");

  useEffect(() => { loadEvals().then(setEvals).catch(() => {}); }, []);

  const sourceHood: Hood | null = useMemo(() => ds?.hoods.find((h) => h.id === fromId) ?? ds?.hoods[0] ?? null, [ds, fromId]);
  const sourceCityId = pin?.city ?? sourceHood?.city ?? "";
  const sourceVec = pin?.vec ?? sourceHood?.v ?? null;
  const sourceCity = ds?.cities.find((c) => c.id === sourceCityId) ?? null;
  const targetCity = toCity ? ds?.cities.find((c) => c.id === toCity) ?? null : null;

  useEffect(() => {
    if (!sourceCityId) return;
    let alive = true;
    setSrcCells(null);
    loadCells(sourceCityId).then((c) => alive && setSrcCells(c)).catch(() => {});
    return () => { alive = false; };
  }, [sourceCityId]);
  useEffect(() => {
    if (!toCity) { setTgtCells(null); return; }
    let alive = true;
    setTgtCells(null);
    loadCells(toCity).then((c) => alive && setTgtCells(c)).catch(() => {});
    return () => { alive = false; };
  }, [toCity]);

  useEffect(() => {
    if (!ds) return;
    const u = new URL(window.location.href);
    u.searchParams.set("from", fromId);
    if (toCity) u.searchParams.set("to", toCity); else u.searchParams.delete("to");
    window.history.replaceState(null, "", u.toString());
  }, [ds, fromId, toCity]);

  const srcSim = useMemo(() => (srcCells && sourceVec ? cellSimilarities(srcCells, sourceVec) : null), [srcCells, sourceVec]);
  const tgtSim = useMemo(() => (tgtCells && sourceVec ? cellSimilarities(tgtCells, sourceVec) : null), [tgtCells, sourceVec]);

  const matches: TwinMatch[] = useMemo(() => {
    if (!ds || !toCity || !sourceVec) return [];
    if (!pin) { const pre = ds.twins[fromId]?.[toCity]; if (pre?.length) return pre.slice(0, 5); }
    return rankHoods(sourceVec, ds.hoods, toCity, 5);
  }, [ds, toCity, sourceVec, pin, fromId]);

  useEffect(() => { setSelected(matches[0]?.hood ?? null); }, [matches]);

  const mapTwins: MapTwin[] = useMemo(
    () => (ds ? matches.map((m) => ({ hood: ds.hoods.find((h) => h.id === m.hood)!, score: m.score })).filter((t) => t.hood) : []),
    [ds, matches],
  );

  const pickHood = useCallback((id: string) => {
    setPin(null); setFromId(id);
    setToCity((t) => (t && ds?.hoods.find((h) => h.id === id)?.city === t ? null : t));
  }, [ds]);
  const pickCity = useCallback((id: string | null) => {
    setToCity(id);
    if (id) { setRight("twins"); setMobileTab("twins"); }
  }, []);

  const onPickSourceCell = useCallback((i: number) => {
    if (!srcCells || !ds) return;
    const lon = srcCells.lon[i], lat = srcCells.lat[i];
    const vec = neighbourhoodVector(srcCells, lon, lat);
    const near = ds.hoods.filter((h) => h.city === srcCells.city)
      .map((h) => ({ h, d: Math.hypot((h.lon - lon) * Math.cos((lat * Math.PI) / 180), h.lat - lat) })).sort((a, b) => a.d - b.d)[0]?.h;
    const top = vec.map((x, k) => [x, k] as const).sort((a, b) => b[0] - a[0]).slice(0, 7).map((x) => x[1]);
    setPin({ kind: "pin", city: srcCells.city, lon, lat, vec, top, label: `cell ${srcCells.g[i]}${near ? ` near ${near.name}` : ""}` });
    setMobileTab("from");
  }, [srcCells, ds]);

  const swap = useCallback(() => {
    if (!ds || !toCity) return;
    const target = selected ?? matches[0]?.hood;
    if (!target) return;
    const back = sourceCityId;
    setPin(null); setFromId(target); setToCity(back);
  }, [ds, toCity, selected, matches, sourceCityId]);

  const onAgentAction = useCallback((a: AgentAction) => {
    if (!ds) return;
    if (a.type === "select" || a.type === "showTwins") {
      setPin(null); setFromId(a.from); setToCity(a.to);
      if (a.twin) setTimeout(() => setSelected(a.twin!), 60);
    } else if (a.type === "flyTo") {
      const h = ds.hoods.find((x) => x.id === a.hood);
      if (!h) return;
      if (h.city === toCity) setSelected(h.id); else { setPin(null); setFromId(h.id); }
    } else if (a.type === "highlightCells") {
      // Show where the item clusters: make the strongest neighbourhood for it the source.
      const best = ds.hoods.filter((h) => h.city === a.city).sort((x, y) => (y.v[a.item] ?? 0) - (x.v[a.item] ?? 0))[0];
      if (best) { setPin(null); setFromId(best.id); setToCity((t) => (t === a.city ? null : t)); }
    }
  }, [ds, toCity]);

  if (error) return <div className="grid min-h-dvh place-items-center text-destructive">failed to load data: {error}</div>;
  if (!ds || !sourceHood || !sourceVec) {
    return <div className="grid min-h-dvh place-items-center text-[12px] text-dim"><span className="cursor-block">loading taste data</span></div>;
  }

  const sourcePoint = { lon: pin?.lon ?? sourceHood.lon, lat: pin?.lat ?? sourceHood.lat, name: pin ? "pin" : sourceHood.name, cityId: sourceCityId };
  const sourceName = pin ? "your pin" : sourceHood.name;

  const sourceUI = <SourcePanel ds={ds} source={sourceHood} pin={pin} toCity={toCity} sourceCityId={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} />;
  const twinsUI = targetCity ? (
    <TwinsPanel ds={ds} matches={matches} selected={selected} onSelect={setSelected} sourceName={sourceName} targetName={targetCity.name} mode={mode} onSwap={swap} evals={evals} />
  ) : (
    <div className="px-4 py-6 text-[12px] leading-relaxed text-muted-foreground">
      <div className="label mb-2">twins</div>
      pick a city under <span className="text-foreground">twin in</span> — the camera flies there and the five closest neighbourhoods
      to <span className="text-foreground">{sourceName.toLowerCase()}</span> light up.
    </div>
  );
  const agentUI = <AgentPanel context={{ fromHood: pin ? null : fromId, toCity }} onAction={onAgentAction} className="h-full" />;

  const map = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <ExploreMap
        source={sourcePoint} sourceCity={sourceCity} targetCity={targetCity} srcCells={srcCells} tgtCells={tgtCells}
        srcSim={srcSim} tgtSim={tgtSim} mode={mode} twins={mapTwins} selectedTwin={selected} basketLabels={ds.basket.map((b) => b.label)}
        onPickSourceCell={onPickSourceCell} onSelectTwin={setSelected} onFlightState={setFlying}
      />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto"><ModeToggle mode={mode} onChange={setMode} /></div>
        <div className="border border-line bg-background/90 px-2 py-1 text-[11px] text-muted-foreground">
          {flying ? <span className="cursor-block">flying to {targetCity?.name.toLowerCase()}</span>
            : mode === "raw" ? <span>raw affinity — mostly <span className="text-foreground">how busy</span> a cell is</span>
              : <span>{sourceCity?.name.toLowerCase()}{targetCity ? <> <span className="text-dim">→</span> {targetCity.name.toLowerCase()}</> : ""}</span>}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 border border-line bg-background/90 px-2 py-1 text-[10.5px] text-dim">
        <span>{mode === "raw" ? "quiet" : "unlike"}</span>
        <span className="h-1.5 w-28" style={{ background: gradientCss(mode === "raw" ? "raw" : "twin") }} />
        <span>{mode === "raw" ? "busy" : `like ${sourceName.toLowerCase()}`}</span>
      </div>
    </div>
  );

  const tabBtn = (id: string, label: string, active: boolean, onClick: () => void, disabled = false) => (
    <button key={id} role="tab" aria-selected={active} disabled={disabled} onClick={onClick}
      className={cn("relative h-full px-4 text-[12px] transition-colors disabled:opacity-40", active ? "text-foreground" : "text-dim hover:text-muted-foreground")}>
      {label}
      {active && <span className="absolute inset-x-3 -bottom-px h-px bg-primary" />}
    </button>
  );

  return (
    <main className="fixed inset-x-0 bottom-0 top-11 bg-background">
      {desktop ? (
        <div className="grid h-full grid-cols-[300px_minmax(0,1fr)_380px]">
          <aside className="min-h-0 overflow-hidden border-r border-line" aria-label="Source neighbourhood">{sourceUI}</aside>
          {map}
          <aside className="flex min-h-0 flex-col border-l border-line" aria-label="Twins and agent">
            <div role="tablist" className="flex h-10 shrink-0 items-stretch border-b border-line">
              {tabBtn("twins", "twins", right === "twins", () => setRight("twins"))}
              {tabBtn("agent", "agent", right === "agent", () => setRight("agent"))}
              <button onClick={() => setCmdOpen(true)} className="ml-auto px-4 text-[11.5px] text-dim transition-colors hover:text-foreground" aria-label="Open search (Command K)">
                search <span className="ml-1 text-line-strong">⌘K</span>
              </button>
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto", right !== "twins" && "hidden")}>{twinsUI}</div>
            <div className={cn("min-h-0 flex-1", right !== "agent" && "hidden")}>{agentUI}</div>
          </aside>
        </div>
      ) : (
        <div className="flex h-full flex-col">
          <div className="h-[42dvh] shrink-0 border-b border-line">{map}</div>
          <div role="tablist" className="flex h-10 shrink-0 items-stretch border-b border-line">
            {tabBtn("from", "from", mobileTab === "from", () => setMobileTab("from"))}
            {tabBtn("twins", "twins", mobileTab === "twins", () => setMobileTab("twins"), !targetCity)}
            {tabBtn("agent", "agent", mobileTab === "agent", () => setMobileTab("agent"))}
          </div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", mobileTab !== "from" && "hidden")}>{sourceUI}</div>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", mobileTab !== "twins" && "hidden")}>{twinsUI}</div>
          <div className={cn("min-h-0 flex-1", mobileTab !== "agent" && "hidden")}>{agentUI}</div>
        </div>
      )}
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} ds={ds} sourceCity={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} />
    </main>
  );
}
