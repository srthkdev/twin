"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import type { AgentAction } from "@/lib/agent/types";
import type { TwinUIMessage } from "@/lib/agent/ai";
import { AgentSettingsPanel } from "./agent-settings";
import { ToolTrace, type ToolStep } from "./tool-trace";
import { emptySettings, loadSettings, saveSettings, type AgentSettings, type Health } from "./settings";

interface RecognitionEvent { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null;
  start(): void; stop(): void;
}
type RecognitionCtor = new () => Recognition;
const getRecognition = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

function saveMarkdown(filename: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Recording names are derived from the question, so `?replay=1` can play back what `?record=1` captured. */
export const recordingName = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const urlFlag = (k: string) => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get(k) : null);

const SUGGEST = [
  "Find the Silver Lake of Berlin",
  "I love Silver Lake. I'm moving to Neukölln — where do I actually go?",
  "Where in Berlin should I open a natural wine bar?",
  "Plan a 3-city European tour for Peso Pluma",
  "What's the vibe of Shimokitazawa, Tokyo?",
];

type Group = { kind: "text"; text: string } | { kind: "tools"; steps: ToolStep[] };

export function AgentPanel({ context, onAction, className }: {
  context: { fromHood: string | null; toCity: string | null };
  onAction: (a: AgentAction) => void;
  className?: string;
}) {
  const [settings, setSettings] = useState<AgentSettings>(emptySettings);
  const [health, setHealth] = useState<Health | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { filename: string; markdown: string }[]>>({});
  const times = useRef(new Map<string, { start: number; end?: number }>());
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const live = useRef({ settings, context, onAction });
  live.current = { settings, context, onAction };
  const lastQuestion = useRef("");

  const transport = useMemo(() => new DefaultChatTransport<TwinUIMessage>({
    api: "/api/agent",
    prepareSendMessagesRequest: ({ messages }) => {
      const { settings: s, context: ctx } = live.current;
      const name = recordingName(lastQuestion.current);
      return {
        headers: s.key ? { "x-agent-key": s.key } : undefined,
        body: {
          messages, context: ctx, model: s.model || undefined,
          ...(urlFlag("record") ? { record: name } : {}),
          ...(urlFlag("replay") ? { replay: name, speed: Number(urlFlag("speed") ?? 1) } : {}),
        },
      };
    },
  }), []);

  const { messages, sendMessage, status, stop, error } = useChat<TwinUIMessage>({
    transport,
    onData: (part) => {
      const p = part as { type: string; data: unknown };
      if (p.type === "data-progress") {
        const d = p.data as { toolCallId: string; note: string };
        setProgress((m) => ({ ...m, [d.toolCallId]: d.note }));
      } else if (p.type === "data-action") {
        const a = p.data as AgentAction;
        if (a.type === "download") setFiles((f) => ({ ...f, last: [...(f.last ?? []), { filename: a.filename, markdown: a.markdown }] }));
        else live.current.onAction(a);
      }
    },
    onFinish: ({ message }) => {
      setFiles((f) => (f.last ? { ...f, [message.id]: f.last, last: [] } : f));
      if (speak && "speechSynthesis" in window) {
        const txt = message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/[*_`#|]/g, "");
        if (txt) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(txt)); }
      }
    },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    setCanListen(!!getRecognition());
    const saved = loadSettings();
    if (saved) setSettings(saved);
    fetch("/api/agent/health").then((r) => r.json() as Promise<Health>).then(setHealth).catch(() => {});
    return () => { window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, progress]);

  // stamp first/last-seen times per tool call so each step shows how long it took
  for (const m of messages) for (const p of m.parts) {
    if (!isToolUIPart(p)) continue;
    const t = times.current.get(p.toolCallId) ?? { start: Date.now() };
    if (!t.end && (p.state === "output-available" || p.state === "output-error")) t.end = Date.now();
    times.current.set(p.toolCallId, t);
  }

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    lastQuestion.current = t;
    setInput("");
    void sendMessage({ text: t });
  };

  const groups = (m: TwinUIMessage): Group[] => {
    const out: Group[] = [];
    for (const p of m.parts) {
      if (isToolUIPart(p)) {
        const o = p.state === "output-available" ? (p.output as { ok?: boolean; summary?: string }) : undefined;
        const t = times.current.get(p.toolCallId)!;
        const step: ToolStep = {
          id: p.toolCallId, name: getToolName(p), args: p.input,
          pending: p.state === "input-streaming" || p.state === "input-available",
          ok: p.state === "output-error" ? false : o?.ok !== false,
          summary: p.state === "output-error" ? p.errorText : o?.summary,
          progress: progress[p.toolCallId], startedAt: t.start, endedAt: t.end,
        };
        const last = out[out.length - 1];
        if (last?.kind === "tools") last.steps.push(step); else out.push({ kind: "tools", steps: [step] });
      } else if (p.type === "text" && p.text.trim()) {
        const last = out[out.length - 1];
        if (last?.kind === "text") last.text += p.text; else out.push({ kind: "text", text: p.text });
      }
    }
    return out;
  };

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = getRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join("");
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) send(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };

  const btn = "h-8 border border-line bg-background px-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";
  const modelLabel = (settings.model || health?.openrouter.models[0] || "").replace(/^[a-z-]+\//, "").replace(/:free$/, "");

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background font-mono text-xs text-foreground", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[11px]">
        <span className="text-dim">model <span className="text-muted-foreground">{modelLabel || "…"}</span>{urlFlag("replay") && <span className="ml-2 text-primary">replay</span>}{urlFlag("record") && <span className="ml-2 text-primary">● rec</span>}</span>
        <button type="button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} className="text-dim hover:text-foreground">
          [{showSettings ? "close" : "settings"}]
        </button>
      </div>
      {showSettings && <AgentSettingsPanel value={settings} onChange={setSettings} health={health} />}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-live="polite">
        {!messages.length && (
          <div className="space-y-3 text-[12px] leading-relaxed text-muted-foreground">
            <p>I find a neighbourhood&apos;s cultural twin anywhere in the world and help you act on it — where to go, where to open something, where to tour.</p>
            <p className="text-dim">Taste comes from Qloo. OpenStreetMap, Wikipedia and the web only add facts, and every step shows its source.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            {m.role === "user" ? (
              <p className="whitespace-pre-wrap break-words border-l-2 border-primary pl-2 text-[12px] text-foreground">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</p>
            ) : (
              <div>
                {groups(m).map((g, j) => g.kind === "text"
                  ? <div key={j} className="break-words"><Markdown source={g.text} variant="chat" /></div>
                  : <ToolTrace key={j} steps={g.steps} />)}
                {busy && i === messages.length - 1 && !m.parts.some((p) => isToolUIPart(p) && (p.state === "input-available" || p.state === "input-streaming")) && (
                  <p className="cursor-block mt-1 text-[11px] text-dim">{m.parts.length ? "thinking" : "planning"}</p>
                )}
                {(files[m.id] ?? (i === messages.length - 1 ? files.last : undefined))?.map((f) => (
                  <button key={f.filename} type="button" onClick={() => saveMarkdown(f.filename, f.markdown)}
                    className="mt-2 flex w-full items-center justify-between border border-primary/60 px-2 py-1.5 text-left text-[11.5px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
                    <span>↓ {f.filename}</span><span className="text-[10.5px] opacity-70">{Math.max(1, Math.round(f.markdown.length / 1024))} KB · markdown</span>
                  </button>
                ))}
                {m.metadata && !busy && (
                  <p className="pt-2 text-[10.5px] text-dim">
                    {[m.metadata.model?.replace(/^[a-z-]+\//, "").replace(/:free$/, ""), `qloo ${m.metadata.qlooLive} live · ${m.metadata.qlooCached} cached`, m.metadata.ms ? `${(m.metadata.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {error && <p className="text-[11.5px] text-destructive">{error.message.replace(/^.*?"error":"?|"?}$/g, "")}</p>}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-line p-3">
        {!messages.length && (
          <div className="flex flex-col items-start gap-1">
            {SUGGEST.map((s) => <button key={s} type="button" onClick={() => send(s)} className="text-left text-[11.5px] text-muted-foreground transition-colors hover:text-primary">→ {s}</button>)}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message the Twin agent" placeholder={listening ? "listening…" : "ask about any neighbourhood"}
            className="h-8 min-w-0 flex-1 border border-line bg-background px-2 text-[12px] outline-none placeholder:text-dim focus:border-primary" />
          {canListen && <button type="button" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Voice input"} className={cn(btn, listening && "border-primary text-primary")}>mic</button>}
          <button type="button" onClick={() => setSpeak((s) => { if (s) window.speechSynthesis?.cancel(); return !s; })} aria-pressed={speak} aria-label="Read answers aloud" className={cn(btn, speak && "border-primary text-primary")}>read</button>
          {busy
            ? <button type="button" onClick={() => void stop()} className={btn}>stop</button>
            : <button type="submit" disabled={!input.trim()} className="h-8 bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-40">send</button>}
        </form>
      </div>
    </div>
  );
}
