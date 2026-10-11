import { readFileSync } from "node:fs";
import path from "node:path";
import { Markdown } from "@/lib/markdown";

export const metadata = { title: "How we built Twin" };

const source = readFileSync(path.join(process.cwd(), "content", "writeup.md"), "utf8");
const toc = [...source.matchAll(/^## (.*)$/gm)].map((m) => ({ t: m[1], id: m[1].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));

export default function BlogPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 pb-24 pt-24 sm:px-8 sm:pt-28 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <nav aria-label="Contents" className="hidden lg:block">
        <div className="sticky top-20">
          <p className="label text-primary">blog</p>
          <ol className="mt-4 space-y-1.5 text-[12px]">
            {toc.map((s) => <li key={s.id}><a href={`#${s.id}`} className="text-dim transition-colors hover:text-foreground">{s.t.toLowerCase()}</a></li>)}
          </ol>
        </div>
      </nav>
      <article className="min-w-0 max-w-[72ch]">
        <p className="label mb-3 text-primary lg:hidden">blog</p>
        <Markdown source={source} />
      </article>
    </main>
  );
}
