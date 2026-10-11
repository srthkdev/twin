"use client";
import { useMemo } from "react";

const N = 6;
function grid(seed: number, f: (x: number, y: number, r: number) => number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: N * N }, (_, i) => f(i % N, Math.floor(i / N), rnd()));
}

export function MethodDiagram() {
  const raw = useMemo(() => grid(7, (x, y, r) => Math.exp(-(((x - 2.5) ** 2 + (y - 2.5) ** 2) / 6)) * 0.85 + r * 0.15), []);
  const base = useMemo(() => grid(7, (x, y) => Math.exp(-(((x - 2.5) ** 2 + (y - 2.5) ** 2) / 6)) * 0.85 + 0.07), []);
  const lift = useMemo(() => raw.map((v, i) => Math.min(1, Math.max(0, (v - base[i]) * 4 + 0.5))), [raw, base]);
  const stages = [
    { title: "Raw affinity", sub: "≈ popularity", data: raw, hue: 35 },
    { title: "− density baseline", sub: "mean rank over basket", data: base, hue: 35 },
    { title: "= z-scored lift", sub: "fingerprint dimension", data: lift, hue: 265 },
  ];
  const cell = 22, gap = 3, w = N * (cell + gap);
  return (
    <svg viewBox="0 0 900 270" className="h-auto w-full" role="img" aria-label="Diagram: raw affinity minus density baseline gives lift, which forms a fingerprint compared by cosine similarity">
      <defs>
        <linearGradient id="md-g" x1="0" x2="1"><stop stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <style>{`
          @keyframes mdpulse { 0%,100%{opacity:.55} 50%{opacity:1} }
          @keyframes mddash { to { stroke-dashoffset: -24 } }
          .md-c { animation: mdpulse 3.6s ease-in-out infinite }
          .md-flow { stroke-dasharray: 6 6; animation: mddash 1.2s linear infinite }
          @media (prefers-reduced-motion: reduce) { .md-c, .md-flow { animation: none } }
        `}</style>
      </defs>
      {stages.map((s, si) => (
        <g key={s.title} transform={`translate(${20 + si * 215}, 40)`}>
          {s.data.map((v, i) => (
            <rect key={i} className="md-c" style={{ animationDelay: `${(i % N) * 0.12 + si * 0.3}s` }} x={(i % N) * (cell + gap)} y={Math.floor(i / N) * (cell + gap)} width={cell} height={cell} rx={4}
              fill={`hsl(${s.hue} ${si === 2 ? 80 : 92}% ${14 + v * 52}%)`} />
          ))}
          <text x={0} y={w + 28} fill="#fff" fontSize={14} fontWeight={600}>{s.title}</text>
          <text x={0} y={w + 46} fill="#9aa3b8" fontSize={11}>{s.sub}</text>
        </g>
      ))}
      <path className="md-flow" d="M 660 110 H 700" stroke="url(#md-g)" strokeWidth={2} fill="none" />
      <g transform="translate(700, 40)">
        <text x={0} y={0} fill="#9aa3b8" fontSize={11}>100-d fingerprint</text>
        {Array.from({ length: 28 }, (_, i) => (
          <rect key={i} className="md-c" style={{ animationDelay: `${i * 0.05}s` }} x={i * 6.4} y={10} width={5} height={24 + ((i * 37) % 40)} rx={1.5} fill="url(#md-g)" opacity={0.85} />
        ))}
        <text x={0} y={130} fill="#fff" fontSize={14} fontWeight={600}>cosine(A, B)</text>
        <text x={0} y={148} fill="#9aa3b8" fontSize={11}>rank the target city</text>
        <circle cx={14} cy={190} r={9} fill="#8b5cf6" /><circle cx={34} cy={190} r={9} fill="#22d3ee" fillOpacity={0.9} />
        <text x={58} y={194} fill="#fff" fontSize={13} fontFamily="var(--font-geist-mono)">0.77</text>
      </g>
    </svg>
  );
}
