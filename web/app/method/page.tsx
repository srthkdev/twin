import { MethodDiagram } from "@/components/method-diagram";

export const metadata = { title: "Method — Twin" };

const LIMITS = [
  ["Coverage gaps", "Cells with sparse Qloo coverage are dropped (a 70% coverage filter removes places like Compton or Santa Monica in the LA probe). Hoods near those gaps rely on fewer cells."],
  ["Basket bias", "Fingerprints only know what the basket contains. Koreatown's Korean-food signal reached just the 51st percentile because the baseline basket is not neutral."],
  ["Ground truth is editorial", "Evaluation pairs come from published comparisons. They are opinions, not measurements, and the pair count is small."],
  ["Taste is not demographics", "Twin matches what places over-index on, not who lives there. Two hoods can share taste with very different incomes or histories."],
];

export default function MethodPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-28 sm:pt-32">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">Method</p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Subtract the crowd, <span className="text-gradient">keep the culture.</span></h1>
      <p className="mt-5 max-w-2xl text-lg text-white/65">
        Qloo&apos;s heatmaps say how strongly a place over-indexes for an artist, brand or tag. But that affinity correlates <span className="font-mono text-white">0.97</span> with
        popularity, so busy places look like everything. Twin removes that shared baseline before comparing places.
      </p>

      <div className="glass mt-10 rounded-3xl p-4 sm:p-8"><MethodDiagram /></div>

      <section className="mt-14 space-y-8">
        <div>
          <h2 className="text-2xl font-semibold">The correction</h2>
          <ol className="mt-4 space-y-3 text-white/70">
            <li><span className="font-mono text-cyan-300">1.</span> For each of the 100 basket items, rank every cell in a city by affinity and convert to a percentile <span className="font-mono">r(c,i)</span>.</li>
            <li><span className="font-mono text-cyan-300">2.</span> Subtract the cell&apos;s mean percentile over the whole basket — its density baseline.</li>
            <li><span className="font-mono text-cyan-300">3.</span> Z-score each item within the city so every dimension has equal weight.</li>
            <li><span className="font-mono text-cyan-300">4.</span> A neighbourhood vector is the mean fingerprint of cells within 1.3 km of its centroid.</li>
          </ol>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="mb-3 text-[10px] uppercase tracking-widest text-white/40">Core formula</div>
          <div className="overflow-x-auto font-mono text-base leading-loose sm:text-lg">
            <div>v<sub>c,i</sub> = z<sub>i</sub>( r<sub>c,i</sub> − <span className="text-amber-300">(1/N) Σ<sub>j</sub> r<sub>c,j</sub></span> )</div>
            <div className="mt-2">sim(A,B) = <span className="text-violet-300">v<sub>A</sub></span> · <span className="text-cyan-300">v<sub>B</sub></span> / ( ‖v<sub>A</sub>‖ ‖v<sub>B</sub>‖ )</div>
          </div>
          <p className="mt-3 text-sm text-white/50">The amber term is the density baseline. Without it, every pair of neighbourhoods scores about 1.00.</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">What it finds</h2>
          <p className="mt-3 text-white/70">Silver Lake maps to Neukölln (Reuterkiez) at <span className="font-mono text-white">0.77</span> with Kreuzberg SO36 at <span className="font-mono text-white">0.72</span>, sharing record stores, Tame Impala, Phoebe Bridgers, Frank Ocean, Peggy Gou and Aesop. Raw heatmaps send every LA neighbourhood to Mitte or Kreuzberg at ~1.00.</p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Limitations</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            {LIMITS.map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><dt className="font-semibold">{t}</dt><dd className="mt-1 text-sm text-white/60">{b}</dd></div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
