const STEPS = [
  { n: "01", title: "sample", body: "One Qloo heatmap per basket item — artists, brands, films, place types — over ~1.2 × 0.6 km geohash cells.", stat: "116 items × 6 cities" },
  { n: "02", title: "correct", body: "Percentile-rank each item across cells, subtract each cell's mean rank over the basket, z-score within the city.", stat: "removes the popularity baseline" },
  { n: "03", title: "fingerprint", body: "Each cell becomes a vector over the basket. A neighbourhood is the mean of the cells within 1.3 km.", stat: "116 dims per place" },
  { n: "04", title: "match", body: "Rank every neighbourhood of the target city by cosine similarity; explain with shared and diverging traits.", stat: "top 5 per city" },
];

export function MethodStrip() {
  return (
    <ol className="grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s) => (
        <li key={s.n} className="flex flex-col border-b border-r border-line p-5">
          <div className="flex items-baseline gap-3">
            <span className="num text-primary">{s.n}</span>
            <h3 className="text-[15px] text-foreground">{s.title}</h3>
          </div>
          <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
          <div className="mt-5 text-[11px] text-dim">{s.stat}</div>
        </li>
      ))}
    </ol>
  );
}
