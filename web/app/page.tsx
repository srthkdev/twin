import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { BugVisual } from "@/components/landing/bug-visual";
import { MethodStrip } from "@/components/landing/method-strip";
import { EvalsTeaser } from "@/components/landing/evals-teaser";
import { AgentSection } from "@/components/landing/agent-section";
import { LogoMark } from "@/components/logo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Twin — find what works, and where it works next",
  description: "Qloo taste data turns into a decision: where to open, expand, move or tour. Get a live report with a verdict, charts and evidence.",
};

function Section({ n, label, title, children }: { n: string; label: string; title: string; children: React.ReactNode }) {
  return (
    <section id={label.replace(/\s/g, "-")} className="scroll-mt-11 border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <p className="label"><span className="text-primary">{n}</span> / {label}</p>
        <h2 className="mt-3 max-w-[24ch] text-balance text-[clamp(24px,3.2vw,38px)] font-medium leading-[1.08] tracking-[-0.04em]">{title}</h2>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <Hero />
      <Section n="01" label="who it is for" title="A neighbourhood decision, for four different lives.">
        <AgentSection />
      </Section>
      <Section n="02" label="the difference" title="A busy street is not the same as the right street.">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
            <p>Popular blocks score highly for almost everything. That makes a busy shopping street and a music neighbourhood look more alike than they should.</p>
            <p>Twin accounts for that busyness, then compares what is distinctive: the artists, brands, food and nightlife that stand out locally. Switch between popularity and taste to see the difference in actual Qloo data.</p>
          </div>
          <BugVisual />
        </div>
      </Section>
      <Section n="03" label="method" title="From local taste to a decision you can inspect.">
        <MethodStrip />
        <Link href="/method" className="link mt-6 inline-block text-[12px] text-muted-foreground">full method and limitations →</Link>
      </Section>
      <Section n="04" label="evidence" title="What holds up, and what doesn't.">
        <EvalsTeaser />
      </Section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[11.5px] text-dim sm:px-8">
        <div className="flex items-center gap-2.5"><LogoMark size={14} /> twin — built for the qloo agentic hackathon, 2026</div>
        <div className="flex gap-5">
          <a href="https://qloo.com" className="link" target="_blank" rel="noreferrer">qloo</a>
          <a href="https://github.com/srthkdev/twin" className="link" target="_blank" rel="noreferrer">source</a>
        </div>
      </footer>
    </main>
  );
}
