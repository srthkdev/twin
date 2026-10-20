import Link from "next/link";

const USES = [
  { k: "move", q: "I love Silver Lake. I'm moving to Neukölln — where do I actually go?", from: "los-angeles-silver-lake", to: "berlin",
    title: "Moving somewhere new", body: "Find the neighbourhood that matches the one you love, then the actual cafés, venues and shops there — picked by Qloo for your taste, with hours." },
  { k: "open", q: "Where in Berlin should I open a natural wine bar?", from: "", to: "berlin",
    title: "Opening a venue", body: "Qloo demand for a taste in every 1 km cell against how many such venues already exist. The gaps light up on the map." },
  { k: "tour", q: "Plan a 3-city European tour for Peso Pluma", from: "", to: "",
    title: "Routing a tour", body: "Where an artist's fans actually are in each city, the strongest neighbourhoods, nearby live-music venues, and whether the artist is rising." },
  { k: "city", q: "Find the Shoreditch of Lisbon", from: "london-shoreditch", to: "",
    title: "Any city on Earth", body: "Ask about a city we didn't precompute and the agent fingerprints it live from Qloo, then remembers it for everyone." },
] as const;

const SOURCES = [
  ["taste — twins, vibe, venues, audiences, brands, demand, momentum", "Qloo", "primary"],
  ["how many venues of a kind physically exist", "Overture Maps", ""],
  ["coordinates, neighbourhood boundaries", "OpenStreetMap", ""],
  ["background facts, population", "Wikipedia", ""],
  ["this week's events, news, closures", "web search", ""],
] as const;

const href = (u: (typeof USES)[number]) => `/explore?${new URLSearchParams({ ...(u.from ? { from: u.from } : {}), ...(u.to ? { to: u.to } : {}), tab: "agent", q: u.q })}`;

export function AgentSection() {
  return (
    <div className="space-y-12">
      <div className="grid gap-px border border-line bg-line sm:grid-cols-2">
        {USES.map((u) => (
          <Link key={u.k} href={href(u)} className="group flex flex-col bg-card p-5 transition-colors hover:bg-raised">
            <div className="text-[15px] text-foreground">{u.title}</div>
            <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">{u.body}</p>
            <div className="mt-4 border-t border-line pt-3 text-[12px] text-dim transition-colors group-hover:text-primary">→ {u.q}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="label mb-3">who answers what</p>
          <table className="w-full text-[12.5px]">
            <tbody>
              {SOURCES.map(([q, src, p]) => (
                <tr key={src} className="border-b border-line">
                  <td className="py-2.5 pr-4 text-muted-foreground">{q}</td>
                  <td className={`py-2.5 text-right ${p ? "text-primary" : "text-foreground"}`}>{src}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11.5px] leading-relaxed text-dim">Qloo makes every taste decision. The others only do jobs Qloo can&apos;t, and every step in the agent&apos;s timeline shows which source it used.</p>
        </div>
        <div>
          <p className="label mb-3">under the hood</p>
          <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <li><span className="text-foreground">23 tools</span> on the Vercel AI SDK, streamed as a live timeline with progress and timing.</li>
            <li><span className="text-foreground">Free open models</span> via OpenRouter — MiniMax M3.1 Flash, falling back to Nemotron 3 Ultra and Inkling.</li>
            <li><span className="text-foreground">Every answer is cached</span> in Vercel Blob, so repeat questions cost no quota.</li>
            <li><span className="text-foreground">MCP server</span> — the same tools inside Claude Code, Codex or any MCP client.</li>
          </ul>
          <Link href="/explore?tab=agent" className="link mt-5 inline-block text-[12px] text-muted-foreground">open the agent →</Link>
        </div>
      </div>
    </div>
  );
}
