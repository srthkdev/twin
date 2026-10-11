import { MethodDiagram } from "@/components/method-diagram";

export const metadata = { title: "Method — Twin" };

const LIMITS = [
  ["The labels are editorial", "Published neighbourhood comparisons are opinions, not measurements, and there are only 31 of them — 24 involve New York."],
  ["Affluence is under-weighted", "Rich areas over-index on many items at once, so subtracting the baseline removes part of their signal. Luxury ↔ income turns negative after correction."],
  ["Coverage is uneven", "Mexico City and Paris return sparse data for many Western basket items, so their twins rest on less evidence."],
  ["Taste is not demographics", "Twin matches what a place over-indexes on, not who lives there. Two twins can differ in income, age and history."],
];

export default function MethodPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-24 sm:px-8 sm:pt-28">
      <p className="label text-primary">method</p>
      <h1 className="mt-3 text-balance text-[clamp(32px,5vw,56px)] font-medium leading-[1.04] tracking-[-0.05em]">
        Subtract the crowd, <span className="text-primary">keep the culture.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
        Qloo&apos;s heatmaps say how strongly a place over-indexes on an artist, brand or kind of venue. Raw affinity tracks Qloo&apos;s
        popularity score at <span className="num text-foreground">r = 0.97</span>, so busy places look like everything. Twin removes that shared
        baseline before comparing places.
      </p>

      <div className="panel mt-10 p-4 sm:p-6"><MethodDiagram /></div>

      <section className="mt-16 flex flex-col gap-14">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">The correction</h2>
          <ol className="mt-5 space-y-3 text-[13px] leading-relaxed text-muted-foreground">
            <li><span className="num text-primary">1.</span> One Qloo heatmap per basket item — 116 artists, brands, films and place types — per city, on ~1.2 × 0.6 km geohash cells.</li>
            <li><span className="num text-primary">2.</span> Rank every cell by affinity for each item and convert to a percentile <span className="text-foreground">r(c,i)</span>.</li>
            <li><span className="num text-primary">3.</span> Subtract the cell&apos;s mean percentile over the whole basket — its popularity baseline.</li>
            <li><span className="num text-primary">4.</span> Z-score each item within the city so a city-wide strength isn&apos;t mistaken for a match.</li>
            <li><span className="num text-primary">5.</span> A neighbourhood is the mean fingerprint of cells within 1.3 km of its centroid; twins are ranked by cosine.</li>
          </ol>
        </div>

        <div className="panel p-6">
          <div className="label mb-3">core formula</div>
          <div className="overflow-x-auto text-[15px] leading-loose sm:text-[17px]">
            <div>v<sub>c,i</sub> = z<sub>i</sub>( r<sub>c,i</sub> − <span className="text-primary">(1/N) Σ<sub>j</sub> r<sub>c,j</sub></span> )</div>
            <div className="mt-2">sim(A,B) = v<sub>A</sub> · v<sub>B</sub> / ( ‖v<sub>A</sub>‖ ‖v<sub>B</sub>‖ )</div>
          </div>
          <p className="mt-3 text-[12px] text-dim">The amber term is the popularity baseline. Without it, cross-city similarities average 0.95; with it, 0.16.</p>
        </div>

        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">What it finds</h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Silver Lake&apos;s closest Berlin neighbourhoods are Kreuzberg (SO36) and Neukölln, sharing vintage clothing, record stores, Peggy Gou and Aesop.
            On raw scores every LA neighbourhood maps to the same central Berlin cells.
          </p>
        </div>

        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">The agent</h2>
          <p className="mt-5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            The fingerprints answer &ldquo;which place is like this one&rdquo;. The agent adds live Qloo calls for what comes next —
            <span className="text-foreground"> local_scene</span> (venues near a neighbourhood, steered by the source&apos;s taste),
            <span className="text-foreground"> audience</span> (age and gender skew) and <span className="text-foreground">cross_domain</span> (brands for fans of an artist).
            It runs on the local Codex CLI or a key you bring, and the same tools ship as an MCP server.
          </p>
        </div>

        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.03em]">Limitations</h2>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {LIMITS.map(([t, b]) => (
              <div key={t} className="panel p-4"><dt className="text-[13px] text-foreground">{t}</dt><dd className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{b}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
