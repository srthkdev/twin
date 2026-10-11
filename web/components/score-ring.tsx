"use client";
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber } from "./animated-number";

export function ScoreRing({ score, size = 52, stroke = 4, label = true }: { score: number; size?: number; stroke?: number; label?: boolean }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score));
  const id = `ring-${size}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Similarity ${score.toFixed(2)}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - pct) : c }}
          animate={{ strokeDashoffset: c * (1 - pct) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {label && (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium tabular-nums">
          <AnimatedNumber value={score} />
        </span>
      )}
    </div>
  );
}
