const STEPS = [
  { n: "01", title: "read the block", body: "Qloo shows where tastes in artists, brands, food and nightlife concentrate, block by block.", stat: "taste data from Qloo" },
  { n: "02", title: "account for busyness", body: "Busy streets score highly for almost everything. Twin removes that baseline to see what makes each block distinctive.", stat: "local taste beyond popularity" },
  { n: "03", title: "find its twin", body: "Compare neighbourhoods across cities using their shared tastes, and show where the match breaks down.", stat: "shared tastes and differences" },
  { n: "04", title: "make the decision", body: "The agent weighs the match, demand and existing places, then builds a report with a verdict, charts and sources.", stat: "a report you can inspect and share" },
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
