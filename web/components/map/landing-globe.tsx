"use client";
import { useEffect } from "react";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { arcSegments, useDeckMap, type ArcSeg } from "./use-deck-map";

export interface GlobeArc { from: [number, number]; to: [number, number]; fromName: string; toName: string; score: number }

export default function LandingGlobe({ arcs }: { arcs: GlobeArc[] }) {
  const { containerRef, mapRef, overlayRef, ready } = useDeckMap({ center: [-30, 28], zoom: 1.5, pitch: 0, interactive: false });

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!, overlay = overlayRef.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Fit the whole globe inside its frame: at zoom z the globe is ~512·2^z/π px across.
    const box = map.getContainer();
    map.setZoom(Math.log2((Math.min(box.clientWidth, box.clientHeight) * 0.86 * Math.PI) / 512));
    map.getStyle().layers.forEach((l) => { if (l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none"); });
    const hubs = Array.from(new Map(arcs.flatMap((a) => [[a.from.join(), a.from], [a.to.join(), a.to]] as [string, [number, number]][])).values());
    const baseSegs = arcs.flatMap((a) => arcSegments(a.from, a.to, 1, 40, 70));
    let raf = 0, last = performance.now(), lon = -30;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      if (!reduce && !document.hidden) {
        lon = ((lon + dt * 4.5 + 540) % 360) - 180;
        map.jumpTo({ center: [lon, 28] });
      }
      const grow = (i: number) => (reduce ? 1 : ((t * 0.16 + i * 0.137) % 1.25));
      overlay.setProps({
        layers: [
          new PathLayer<ArcSeg>({ id: "arcs-base", data: baseSegs, getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: "pixels", getWidth: 1.2, capRounded: true }),
          new PathLayer<ArcSeg>({
            id: "arcs-glow", data: arcs.flatMap((a, i) => arcSegments(a.from, a.to, Math.min(1, grow(i)), 40, 255)),
            getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: "pixels", getWidth: 3.4, capRounded: true,
            updateTriggers: { getPath: [Math.floor(t * 30)], getColor: [Math.floor(t * 30)] },
          }),
          new ScatterplotLayer<[number, number]>({
            id: "hubs", data: hubs, getPosition: (d) => d, getFillColor: [230, 227, 218, 230],
            radiusUnits: "pixels", getRadius: 2.6, radiusScale: 1,
          }),
          new ScatterplotLayer<[number, number]>({
            id: "hubs-halo", data: hubs, getPosition: (d) => d, getFillColor: [240, 160, 60, 46],
            radiusUnits: "pixels", getRadius: 9, radiusScale: reduce ? 1 : 1 + 0.35 * Math.sin(t * 2),
            updateTriggers: { radiusScale: [Math.floor(t * 30)] },
          }),
        ],
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, arcs, mapRef, overlayRef]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} className="bg-background" aria-hidden />;
}
