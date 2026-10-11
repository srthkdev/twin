"use client";
import { motion } from "framer-motion";
import { Map as MapIcon, Scale, Fingerprint, Compass } from "lucide-react";

const STEPS = [
  { icon: MapIcon, title: "Heatmaps", body: "One Qloo heatmap per basket item (artists, brands, place tags) over ~1.2 × 0.6 km geohash cells.", stat: "640 calls" },
  { icon: Scale, title: "Density correction", body: "Percentile-rank each item, subtract each cell's mean rank over the basket, z-score within the city.", stat: "r 0.97 → 0" },
  { icon: Fingerprint, title: "Fingerprints", body: "Every cell becomes a 100-d taste vector. A neighbourhood is the mean of cells within 1.3 km.", stat: "100 dims" },
  { icon: Compass, title: "Cosine twins", body: "Rank every hood in the target city by cosine similarity; explain with shared and diverging traits.", stat: "top-5 twins" },
];

export function MethodStrip() {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <motion.li key={s.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.1, duration: 0.6 }}
          className="glass group relative overflow-hidden rounded-2xl p-5 transition hover:-translate-y-1 hover:border-violet-400/40">
          <div className="absolute -right-6 -top-8 font-mono text-[96px] font-bold leading-none text-white/[0.03]">{i + 1}</div>
          <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-gradient-accent text-black"><s.icon className="size-5" /></div>
          <h3 className="text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/60">{s.body}</p>
          <div className="mt-4 font-mono text-xs text-cyan-300">{s.stat}</div>
        </motion.li>
      ))}
    </ol>
  );
}
