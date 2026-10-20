import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { BugVisual } from "@/components/landing/bug-visual";
import { MethodStrip } from "@/components/landing/method-strip";
import { EvalsTeaser } from "@/components/landing/evals-teaser";
import { AgentSection } from "@/components/landing/agent-section";
import { LogoMark } from "@/components/logo";

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
      <Section n="01" label="the bias" title="Raw taste data mostly measures how busy a place is.">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="space-y-4 text-[13px] leading-relaxed text-muted-foreground">
            <p>We pulled Qloo heatmaps for a basket of artists, brands and place types. A cell&apos;s raw affinity tracks
              Qloo&apos;s own popularity score at <span className="num text-foreground">r = 0.97</span>: wherever people are,
              everything scores high.</p>
            <p>Compare neighbourhoods on raw scores and they all come out near-identical. Subtract each cell&apos;s baseline and
              the city&apos;s real texture comes back — Compton at the <span className="num text-foreground">99th</span> percentile
              for Kendrick Lamar, East LA for Peso Pluma, Silver Lake near the bottom for it.</p>
          </div>
          <BugVisual />
        </div>
      </Section>
      <Section n="02" label="the agent" title="Ask it to do the work, not just answer.">
        <AgentSection />
      </Section>
      <Section n="03" label="method" title="Four steps from heatmaps to twins.">
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
