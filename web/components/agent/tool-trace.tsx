"use client";
import { cn } from "@/lib/utils";

export interface ToolStep { id: string; name: string; args: unknown; pending: boolean; ok?: boolean; summary?: string }

function shortArgs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const ents = Object.entries(args as Record<string, unknown>);
  const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const s = ents.map(([k, v], i) => (i === 0 ? fmt(v) : `${k}=${fmt(v)}`)).join(", ");
  return s.length > 70 ? s.slice(0, 69) + "…" : s;
}

/** Compact, collapsible trace of tool calls, e.g. `> local_scene(neukolln…) ✓ 8 places`. */
export function ToolTrace({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="my-1 font-mono text-xs text-muted-foreground">
      {steps.map((s) => (
        <details key={s.id} className="group">
          <summary className="flex cursor-pointer list-none gap-1 py-0.5 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span aria-hidden>·</span>
            <span className="min-w-0 flex-1 break-words">
              <span className="text-foreground">{s.name}</span>({shortArgs(s.args)}){" "}
              {s.pending ? <span className="animate-pulse">…</span> : <span className={cn(!s.ok && "text-destructive")}>→ {s.ok ? "" : "failed: "}{s.summary}</span>}
            </span>
          </summary>
          <pre className="mb-1 ml-3 max-h-40 overflow-auto whitespace-pre-wrap break-words border border-border p-1.5 text-[11px]">{JSON.stringify(s.args, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}
