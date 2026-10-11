"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronUp, Command as CommandIcon, MessageSquare, Plane } from "lucide-react";
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
import { AgentDrawer } from "./agent-drawer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const ExploreMap = dynamic(() => import("@/components/map/explore-map"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-[#07080b] text-sm text-white/40">Loading globe…</div>,
});

const DEFAULT_FROM = "los-angeles-silver-lake";

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
  const [agentOpen, setAgentOpen] = useState(false);
  const [flying, setFlying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [tab, setTab] = useState<"source" | "twins">("source");

  useEffect(() => { loadEvals().then(setEvals).catch(() => {}); }, []);

  const sourceHood: Hood | null = useMemo(() => ds?.hoods.find((h) => h.id === fromId) ?? ds?.hoods[0] ?? null, [ds, fromId]);
  const sourceCityId = pin?.city ?? sourceHood?.city ?? "";
  const sourceVec = pin?.vec ?? sourceHood?.v ?? null;
  const sourceCity = ds?.cities.find((c) => c.id === sourceCityId) ?? null;
  const targetCity = toCity ? ds?.cities.find((c) => c.id === toCity) ?? null : null;

  // load cells
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

  // URL sync (no re-render)
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
  const pickCity = useCallback((id: string | null) => { setToCity(id); if (id) { setTab("twins"); setSheetOpen(true); } }, []);

  const onPickSourceCell = useCallback((i: number) => {
    if (!srcCells || !ds) return;
    const lon = srcCells.lon[i], lat = srcCells.lat[i];
    const vec = neighbourhoodVector(srcCells, lon, lat);
    const near = ds.hoods.filter((h) => h.city === srcCells.city)
      .map((h) => ({ h, d: Math.hypot((h.lon - lon) * Math.cos((lat * Math.PI) / 180), h.lat - lat) })).sort((a, b) => a.d - b.d)[0]?.h;
    const top = vec.map((x, k) => [x, k] as const).sort((a, b) => b[0] - a[0]).slice(0, 6).map((x) => x[1]);
    setPin({ kind: "pin", city: srcCells.city, lon, lat, vec, top, label: `Pin ${srcCells.g[i]}${near ? ` · near ${near.name}` : ""}` });
    setTab("source");
  }, [srcCells, ds]);

  const swap = useCallback(() => {
    if (!ds || !toCity) return;
    const target = selected ?? matches[0]?.hood;
    if (!target) return;
    const back = sourceCityId;
    setPin(null); setFromId(target); setToCity(back);
  }, [ds, toCity, selected, matches, sourceCityId]);

  const onAgentAction = useCallback((a: AgentAction) => {
    if (a.type === "select") {
      setPin(null); setFromId(a.from); setToCity(a.to); setTab("twins");
      setTimeout(() => a.twin && setSelected(a.twin), 50);
    }
  }, []);

  if (error) return <div className="grid min-h-dvh place-items-center text-red-300">Failed to load data: {error}</div>;
  if (!ds || !sourceHood || !sourceVec) {
    return <div className="grid min-h-dvh place-items-center"><div className="flex items-center gap-3 text-white/50"><span className="size-2 animate-ping rounded-full bg-cyan-300" /> Loading taste data…</div></div>;
  }

  const sourcePoint = { lon: pin?.lon ?? sourceHood.lon, lat: pin?.lat ?? sourceHood.lat, name: pin ? pin.label.split(" · ")[0] : sourceHood.name, cityId: sourceCityId };
  const sourceName = pin ? "Your pin" : sourceHood.name;

  const sourceUI = <SourcePanel ds={ds} source={sourceHood} pin={pin} toCity={toCity} sourceCityId={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} />;
  const twinsUI = targetCity ? (
    <TwinsPanel ds={ds} matches={matches} selected={selected} onSelect={setSelected} sourceName={sourceName} targetName={targetCity.name} mode={mode} onSwap={swap} evals={evals} loading={false} />
  ) : (
    <div className="grid place-items-center gap-3 py-10 text-center text-sm text-white/50"><Plane className="size-8 text-violet-300" />Choose a target city to fly there and see the twins.</div>
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#07080b]">
      <ExploreMap
        source={sourcePoint} sourceCity={sourceCity} targetCity={targetCity} srcCells={srcCells} tgtCells={tgtCells}
        srcSim={srcSim} tgtSim={tgtSim} mode={mode} twins={mapTwins} selectedTwin={selected} basketLabels={ds.basket.map((b) => b.label)}
        onPickSourceCell={onPickSourceCell} onSelectTwin={setSelected} onFlightState={setFlying}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#07080b]/80 to-transparent" />

      <div className="pointer-events-none absolute inset-x-0 top-[72px] z-20 flex flex-col items-center gap-2 px-3 lg:top-[84px]">
        <div className="pointer-events-auto"><ModeToggle mode={mode} onChange={setMode} /></div>
        <AnimatePresence>
          {mode === "raw" && (
            <motion.div key="raw" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="glass pointer-events-auto flex max-w-xl items-center gap-2 rounded-2xl border-amber-300/30 px-4 py-2.5 text-sm text-amber-100">
              <AlertTriangle className="size-4 shrink-0 text-amber-300" /> Raw affinity ≈ popularity — every neighbourhood looks the same.
            </motion.div>
          )}
          {flying && (
            <motion.div key="fly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass pointer-events-none flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-white/70">
              <Plane className="size-3.5 text-cyan-300" /> Flying to {targetCity?.name}…
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {desktop ? (
        <>
          <motion.aside initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
            className="glass absolute bottom-4 left-4 top-[84px] z-20 w-[340px] overflow-y-auto rounded-3xl p-4" aria-label="Source neighbourhood">
            {sourceUI}
          </motion.aside>
          {targetCity && (
            <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
              className="glass absolute bottom-4 right-4 top-[84px] z-20 w-[380px] overflow-y-auto rounded-3xl p-4" aria-label="Twin results">
              {twinsUI}
            </motion.aside>
          )}
        </>
      ) : (
        <section aria-label="Controls" className={cn("glass absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-3xl transition-[height] duration-300", sheetOpen ? "h-[48dvh]" : "h-[96px]")}>
          <button onClick={() => setSheetOpen((o) => !o)} className="flex w-full flex-col items-center gap-2 pt-2" aria-expanded={sheetOpen} aria-label={sheetOpen ? "Collapse panel" : "Expand panel"}>
            <span className="h-1 w-10 rounded-full bg-white/25" />
            <ChevronUp className={cn("size-4 text-white/50 transition", sheetOpen && "rotate-180")} />
          </button>
          <Tabs value={tab} onValueChange={(v) => { setTab(v as "source" | "twins"); setSheetOpen(true); }} className="px-4">
            <TabsList className="w-full bg-white/[0.05]">
              <TabsTrigger value="source" className="flex-1">Source</TabsTrigger>
              <TabsTrigger value="twins" className="flex-1" disabled={!targetCity}>Twins</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">{tab === "source" || !targetCity ? sourceUI : twinsUI}</div>
        </section>
      )}

      <div className={cn("pointer-events-none absolute z-10 hidden items-center gap-2 text-[10px] uppercase tracking-widest text-white/50 sm:flex", desktop ? "bottom-6 left-[372px]" : "bottom-[110px] left-4")}>
        <span>{mode === "raw" ? "quiet" : "less like"}</span>
        <span className="h-1.5 w-40 rounded-full" style={{ background: gradientCss(mode === "raw" ? "raw" : "twin") }} />
        <span>{mode === "raw" ? "busy" : `more like ${sourceName}`}</span>
      </div>

      <div className={cn("absolute z-30 flex items-center gap-2", desktop ? "bottom-5" : "right-3 top-[124px]")} style={desktop ? { right: targetCity ? 412 : 20 } : undefined}>
        <Button onClick={() => setCmdOpen(true)} variant="outline" className="glass h-10 gap-2 rounded-full border-white/15 px-3 text-xs" aria-label="Open search (Command K)">
          <CommandIcon className="size-3.5" /> <span className="hidden sm:inline">Search</span> <kbd className="hidden rounded bg-white/10 px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
        </Button>
        <Button onClick={() => setAgentOpen(true)} className="bg-gradient-accent h-10 gap-2 rounded-full px-4 font-semibold text-black shadow-[0_0_30px_-4px_rgba(34,211,238,.7)]" aria-label="Open Twin agent">
          <MessageSquare className="size-4" /> Ask Twin
        </Button>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} ds={ds} sourceCity={sourceCityId} onPickHood={pickHood} onPickCity={pickCity} />
      <AgentDrawer open={agentOpen} onOpenChange={setAgentOpen} context={{ fromHood: pin ? null : fromId, toCity }} onAction={onAgentAction} />
    </main>
  );
}
