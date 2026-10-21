"use client";
import { useState } from "react";

export function ShareActions({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(`/r/${encodeURIComponent(id)}`, window.location.origin).toString());
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  return <div className="print-hidden flex items-center gap-2">
    <button type="button" onClick={copy} className="border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">{copied ? "copied" : "share link"}</button>
    <button type="button" onClick={() => window.print()} className="border border-line-strong px-2.5 py-1.5 text-[10.5px] text-muted-foreground hover:border-primary hover:text-primary">save as PDF</button>
  </div>;
}
