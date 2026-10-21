"use client";
import { useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { arcSegments, useDeckMap, type ArcSeg } from "./use-deck-map";

export interface GlobeArc { from: [number, number]; to: [number, number]; fromName: string; toName: string; score: number }

export default function LandingGlobe({ arcs }: { arcs: GlobeArc[] }) {
  const { containerRef, mapRef, overlayRef, ready } = useDeckMap({ center: [-30, 28], zoom: 1.5, pitch: 0, interactive: false });
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)", { initializeWithValue: false });

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!, overlay = overlayRef.current!;
    // Fit the whole globe inside its frame: at zoom z the globe is ~512·2^z/π px across.
    const box = map.getContainer();
    map.setZoom(Math.log2((Math.min(box.clientWidth, box.clientHeight) * 0.86 * Math.PI) / 512));
    map.getStyle().layers.forEach((l) => { if (l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none"); });
    const hubs = Array.from(new Map(arcs.flatMap((a) => [[a.from.join(), a.from], [a.to.join(), a.to]] as [string, [number, number]][])).values());
    // Geometry is built once; each frame only moves the camera, so deck.gl just re-projects static buffers.
    overlay.setProps({
      layers: [
        new PathLayer<ArcSeg>({ id: "arcs", data: arcs.flatMap((a) => arcSegments(a.from, a.to, 1, 40, 200)), getPath: (d) => d.path, getColor: (d) => d.color, widthUnits: "pixels", getWidth: 1.6, capRounded: true }),
        new ScatterplotLayer<[number, number]>({ id: "hubs-halo", data: hubs, getPosition: (d) => d, getFillColor: [240, 160, 60, 46], radiusUnits: "pixels", getRadius: 8 }),
        new ScatterplotLayer<[number, number]>({ id: "hubs", data: hubs, getPosition: (d) => d, getFillColor: [230, 227, 218, 230], radiusUnits: "pixels", getRadius: 2.6 }),
      ],
    });
    if (reduce) return;
    let raf = 0, last = performance.now(), lon = -30;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      if (dt < 1 / 30 || document.hidden) return; // 30 fps is plenty for a slow spin
      last = now;
      lon = ((lon + dt * 4.5 + 540) % 360) - 180;
      map.jumpTo({ center: [lon, 28] });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, arcs, mapRef, overlayRef, reduce]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} className="bg-background" aria-hidden />;
}
