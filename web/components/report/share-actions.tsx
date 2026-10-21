"use client";
import { useState } from "react";
import type { Report } from "@/lib/agent/report-types";
import { downloadMarkdown } from "./markdown";

export function ShareActions({ id, report }: { id: string; report?: Report }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(`/r/${encodeURIComponent(id)}`, window.location.origin).toString());
      setCopyError(false); setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); setCopyError(true); }
  };
  return <div className="print-hidden flex flex-wrap items-center gap-2">
    <a data-tour="pdf" href={`/api/reports/${encodeURIComponent(id)}/pdf`} download className="border border-primary/60 px-2.5 py-1.5 text-[10.5px] text-primary hover:bg-primary/10">Download PDF</a>
    <button type="button" onClick={copy} className="border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">{copied ? "Copied" : "Share link"}</button>
    {report && <button type="button" onClick={() => downloadMarkdown(report)} className="border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">Markdown</button>}
    {copyError && <a href={`/r/${encodeURIComponent(id)}`} className="text-[10.5px] text-muted-foreground underline">Open share link</a>}
    <span role="status" className="sr-only">{copied ? "Share link copied" : copyError ? "Could not copy. Open the share link to copy its address." : ""}</span>
  </div>;
}
