import Link from "next/link";
import { Hero } from "@/components/landing/hero";
import { BugVisual } from "@/components/landing/bug-visual";
import { MethodStrip } from "@/components/landing/method-strip";
import { EvalsTeaser } from "@/components/landing/evals-teaser";
import { LogoMark } from "@/components/logo";

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-28">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h2>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <Hero />
      <Section eyebrow="01 · The bug" title="The bug in raw taste data">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4 text-white/70">
            <p className="text-lg">We pulled Qloo heatmaps for a basket of artists, brands and tags. Raw affinity correlates <span className="font-mono text-white">0.97</span> with Qloo&apos;s popularity score — it&apos;s an activity-density map in disguise.</p>
            <p>Ask raw data for Silver Lake&apos;s twin in Berlin and every neighbourhood answers Mitte, at cosine <span className="font-mono text-white">~1.00</span>. Subtract the density baseline and the real geography appears: Compton at the 98th percentile for Kendrick, Boyle Heights for Peso Pluma, and Neukölln for the Silver Lake crowd.</p>
          </div>
          <BugVisual />
        </div>
      </Section>
      <Section eyebrow="02 · The method" title="How Twin works">
        <MethodStrip />
        <Link href="/method" className="mt-6 inline-block text-sm text-cyan-300 underline-offset-4 hover:underline">Read the full method →</Link>
      </Section>
      <Section eyebrow="03 · The proof" title="Does it actually find twins?">
        <EvalsTeaser />
      </Section>
      <footer className="border-t border-white/10 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-white/50">
          <div className="flex items-center gap-2"><LogoMark size={20} /> Twin — built for the Qloo hackathon</div>
          <div className="flex items-center gap-5">
            <span>Powered by <a href="https://qloo.com" className="text-white underline-offset-4 hover:underline" target="_blank" rel="noreferrer">Qloo</a></span>
            <a href="https://github.com/srthkdev/twin" className="underline-offset-4 hover:text-white hover:underline" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
