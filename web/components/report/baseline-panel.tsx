"use client";
import { useEffect, useRef, useState } from "react";
import type { BaselineComparison, BaselineStatus, ReportPlace } from "@/lib/agent/baseline";
import { loadSettings } from "@/components/agent/settings";

export interface BaselinePanelProps {
  question: string;
  reportId?: string;
  reportPlaces: readonly ReportPlace[];
  agentKey?: string;
  model?: string;
}
const statusClass: Record<BaselineStatus, string> = {
  verified: "border-primary/40 text-primary",
  "not found": "border-destructive/50 text-destructive",
  "wrong city": "border-primary/60 text-primary",
  unchecked: "border-line-strong text-dim",
};

export function BaselinePanel({ question, reportId, reportPlaces, agentKey, model }: BaselinePanelProps) {
  const [result, setResult] = useState<{ question: string; reportId?: string; data: BaselineComparison }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ question: string; reportId?: string; message: string }>();
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, [question, reportId]);
  const data = result?.question === question && result.reportId === reportId ? result.data : undefined;
  const message = error?.question === question && error.reportId === reportId ? error.message : "";
  const compare = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(undefined);
    try {
      const settings = loadSettings();
      const key = agentKey || settings?.key;
      const response = await fetch("/api/baseline", {
        method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "x-agent-key": key } : {}) },
        body: JSON.stringify({ question, ...(reportId ? { reportId } : {}), model: model || settings?.model || undefined }), signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "The comparison could not finish. Try again.");
      if (!controller.signal.aborted) setResult({ question, reportId, data: value as BaselineComparison });
    } catch (e) {
      if (!controller.signal.aborted) setError({ question, reportId, message: e instanceof Error ? e.message : "The comparison could not finish. Try again." });
    } finally {
      if (request.current === controller) setLoading(false);
    }
  };
  const places = reportPlaces.length ? reportPlaces : data?.reportPlaces ?? [];
  const notFound = data?.places.filter((p) => p.status === "not found").length ?? 0;
  const wrongCity = data?.places.filter((p) => p.status === "wrong city").length ?? 0;
  const unchecked = data?.places.filter((p) => p.status === "unchecked").length ?? 0;
  return <section className="report-block print-hidden mt-6 min-w-0 border-t border-line-strong pt-5" aria-label="Without Twin" aria-busy={loading}>
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h3 className="label">Without Twin</h3>
      {!data && <button type="button" onClick={compare} disabled={loading || !question.trim()} className="border border-line-strong px-2.5 py-1.5 text-left text-[10.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-50">{loading ? "checking the plain answer’s places…" : "compare with a plain AI answer"}</button>}
    </div>
    {message && <p role="alert" className="mt-3 text-[11px] leading-relaxed text-destructive">{message}</p>}
    {data && <>
      <p role="status" className="num mt-3 text-[12px] leading-relaxed">{data.places.length ? `${notFound} of ${data.places.length} places the plain model named could not be found.` : "The plain model did not name any places."}{wrongCity > 0 && ` ${wrongCity} ${wrongCity === 1 ? "was" : "were"} in another city.`}{unchecked > 0 && ` ${unchecked} could not be checked.`}</p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-dim">Checks confirm place names and cities. They do not confirm the plain answer’s claims about taste or demand. Missing listings may be gaps in the data.</p>
      <div className="mt-4 grid grid-cols-1 border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-line">
        <div className="min-w-0 border-b border-line px-3 py-3 sm:border-b-0">
          <h4 className="label mb-3">Plain AI answer</h4>
          <ul className="divide-y divide-line">{data.places.map((place, i) => <li key={i} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="break-words text-[12px] font-medium">{place.name}</span>
              <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] ${statusClass[place.status]}`}>{place.status}</span>
            </div>
            <p className="mt-1 text-[10px] text-dim">{place.city || "City not given"}</p>
            {place.claim && <p className="mt-1.5 break-words text-[11px] leading-relaxed text-muted-foreground">{place.claim}</p>}
            <p className="mt-1.5 break-words text-[10px] leading-relaxed text-dim">{place.reason}</p>
            {place.address && <p className="mt-1 break-words text-[10px] leading-relaxed text-dim">{place.address}</p>}
          </li>)}</ul>
          {!data.places.length && <p className="text-[11px] text-dim">No places named.</p>}
        </div>
        <div className="min-w-0 px-3 py-3">
          <h4 className="label mb-3">With Twin</h4>
          <ul className="divide-y divide-line">{places.map((place, i) => <li key={`${place.link}-${i}`} className="py-3 first:pt-0">
            <p className="break-words text-[12px] font-medium">{place.label}</p>
            {place.note && <p className="mt-1.5 break-words text-[11px] leading-relaxed text-muted-foreground">{place.note}</p>}
            {data.missedPlaces.some((p) => p.link === place.link) && <p className="mt-1.5 text-[10px] text-primary">Not named by the plain AI</p>}
          </li>)}</ul>
          {!places.length && <p className="text-[11px] text-dim">No places listed in this report.</p>}
        </div>
      </div>
      {data.reportId && <p className="mt-3 text-[10.5px] text-muted-foreground">{data.missedPlaces.length} of {data.reportPlaces.length} report places were not named by the plain AI.</p>}
      <details className="mt-3 text-[11px] leading-relaxed">
        <summary className="cursor-pointer text-muted-foreground hover:text-primary">Read the plain answer</summary>
        <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">{data.answer}</p>
      </details>
      <p className="mt-3 break-words text-[9px] text-dim">{data.model} · fresh answer</p>
    </>}
  </section>;
}
