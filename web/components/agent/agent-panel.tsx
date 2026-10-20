"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentAction, AgentResponse, ProviderId, StreamEvent } from "@/lib/agent/types";
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

type Part = { kind: "text"; text: string } | { kind: "tool"; step: ToolStep };
interface UiMessage { role: "user" | "assistant"; parts: Part[]; error?: string; meta?: string; progress?: string }
const textOf = (m: UiMessage) => m.parts.filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text").map((p) => p.text).join("\n\n").trim();

/** Save a markdown brief through a temporary anchor (this runs in the real app, not a sandbox). */
function saveMarkdown(filename: string, markdown: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SUGGEST = ["Find the Silver Lake of Berlin", "Why are they similar?", "I love Silver Lake. I'm moving to Neukölln, where do I go?", "Where in London do Peso Pluma fans cluster?"];
const INTRO = 'Ask for the twin of any neighbourhood, e.g. "find the Silver Lake of Berlin". With an LLM provider I call Twin\'s measured taste data and live Qloo, and say when I am using general knowledge.';

export function AgentPanel({ context, onAction, className }: {
  context: { fromHood: string | null; toCity: string | null };
  onAction: (a: AgentAction) => void;
  className?: string;
}) {
  const [settings, setSettings] = useState<AgentSettings>(emptySettings);
  const [health, setHealth] = useState<Health | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onActionRef = useRef(onAction);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);
  const dispatch = useCallback((act: AgentAction) => {
    const a = act as AgentAction | { type: "download"; filename: string; markdown: string };
    if (a.type === "download") saveMarkdown(a.filename, a.markdown); else onActionRef.current(a);
  }, []);

  // restore settings, then ask the server what is available (free open models are the default)
  useEffect(() => {
    setCanListen(!!getRecognition());
    const saved = loadSettings();
    let alive = true;
    fetch("/api/agent/health").then((r) => r.json() as Promise<Health>).then((h) => {
      if (!alive) return;
      setHealth(h);
      setSettings((cur) => {
        const base = saved ?? cur;
        // "offline" is the pre-health default that gets persisted on first render — never treat it as a choice.
        const known: ProviderId[] = ["openrouter", "anthropic", "openai"];
        const want = saved?.provider && known.includes(saved.provider) ? saved.provider : undefined;
        const provider: ProviderId = want ?? (h.openrouter.available ? "openrouter" : "offline");
        return { ...base, provider };
      });
    }).catch(() => { if (alive && saved) setSettings(saved); });
    return () => { alive = false; abortRef.current?.abort(); window.speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages]);

  const patchLast = (fn: (m: UiMessage) => UiMessage) => setMessages((ms) => { const c = [...ms]; c[c.length - 1] = fn(c[c.length - 1]); return c; });

  const applyEvent = useCallback((ev: StreamEvent) => {
    const e = ev as StreamEvent | { type: "progress"; id: string; note: string };
    if (e.type === "progress") {
      patchLast((m) => ({ ...m, progress: e.note }));
    } else if (e.type === "text") {
      patchLast((m) => {
        const parts = [...m.parts]; const last = parts[parts.length - 1];
        if (last?.kind === "text") parts[parts.length - 1] = { kind: "text", text: last.text + e.delta };
        else parts.push({ kind: "text", text: e.delta.replace(/^\s+/, "") });
        return { ...m, parts };
      });
    } else if (e.type === "tool_call") {
      patchLast((m) => ({ ...m, parts: [...m.parts, { kind: "tool", step: { id: e.id, name: e.name, args: e.args, pending: true } }] }));
    } else if (e.type === "tool_result") {
      patchLast((m) => ({ ...m, parts: m.parts.map((p) => (p.kind === "tool" && p.step.id === e.id ? { kind: "tool", step: { ...p.step, pending: false, ok: e.ok, summary: e.summary } } : p)) }));
      patchLast((m) => ({ ...m, progress: undefined }));
      e.uiActions.forEach(dispatch);
    } else if (e.type === "error") {
      patchLast((m) => ({ ...m, error: e.message, progress: undefined }));
    } else if (e.type === "done") {
      const q = (e.qlooLive ?? 0) + (e.qlooCached ?? 0);
      patchLast((m) => ({ ...m, progress: undefined, meta: `${e.provider}${q ? ` · ${e.qlooLive} live qloo call${e.qlooLive === 1 ? "" : "s"}${e.qlooCached ? `, ${e.qlooCached} cached` : ""}` : ""}` }));
    }
  }, [dispatch]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const history = [...messages, { role: "user", parts: [{ kind: "text", text: t }] } as UiMessage];
    setMessages([...history, { role: "assistant", parts: [] }]);
    setInput("");
    setBusy(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    const { provider } = settings;
    const key = provider === "anthropic" || provider === "openai" || provider === "openrouter" ? (settings.keys[provider] ?? "").trim() : "";
    try {
      if ((provider === "anthropic" || provider === "openai") && !key) throw new Error(`Add your ${provider === "anthropic" ? "Anthropic" : "OpenAI"} API key in settings first.`);
      const res = await fetch("/api/agent", {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json", ...(key ? { "x-agent-key": key } : {}) },
        body: JSON.stringify({
          provider, model: settings.models[provider] || undefined, context,
          messages: history.map((m) => ({ role: m.role, content: textOf(m) })).filter((m) => m.content),
        }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
      if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
        const data = (await res.json()) as AgentResponse;
        patchLast((m) => ({ ...m, parts: [{ kind: "text", text: data.reply }], meta: "offline" }));
        data.actions?.forEach(dispatch);
      } else {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            if (chunk.startsWith("data: ")) { try { applyEvent(JSON.parse(chunk.slice(6)) as StreamEvent); } catch { /* skip bad frame */ } }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: e instanceof Error ? e.message : "Could not reach the agent." }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      if (speak && "speechSynthesis" in window) {
        setMessages((ms) => { const last = ms[ms.length - 1]; const s = last ? textOf(last) : ""; if (s) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(s)); } return ms; });
      }
    }
  }, [busy, messages, settings, context, applyEvent, speak, dispatch]);

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    const Ctor = getRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = true; r.continuous = false;
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join("");
      setInput(text);
      if (e.results[e.results.length - 1].isFinal) void send(text);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    setListening(true);
    r.start();
  };

  const btn = "h-8 border border-border bg-background px-2 font-mono text-xs text-foreground hover:bg-muted disabled:opacity-50";
  const pLabel = { openrouter: "open models", anthropic: "anthropic", openai: "openai", offline: "offline" }[settings.provider];

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background font-mono text-xs text-foreground", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-muted-foreground">agent · {pLabel}{settings.models[settings.provider] ? ` · ${settings.models[settings.provider]}` : ""}</span>
        <button type="button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} className="text-muted-foreground hover:text-foreground">
          [{showSettings ? "hide settings" : "settings"}]
        </button>
      </div>
      {showSettings && <AgentSettingsPanel value={settings} onChange={setSettings} health={health} />}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
        {!messages.length && <p className="text-muted-foreground">{INTRO}</p>}
        {messages.map((m, i) => (
          <div key={i}>
            {m.role === "user" ? (
              <p className="whitespace-pre-wrap break-words text-muted-foreground">&gt; {textOf(m)}</p>
            ) : (
              <div className="space-y-1">
                {m.parts.map((p, j) => p.kind === "text"
                  ? <p key={j} className="whitespace-pre-wrap break-words leading-relaxed">{p.text}</p>
                  : <ToolTrace key={j} steps={[p.step]} />)}
                {busy && i === messages.length - 1 && !m.error && (m.progress
                  ? <p className="cursor-block break-words text-dim">{m.progress}</p>
                  : <span className="animate-pulse text-muted-foreground">…</span>)}
                {m.error && <p className="text-destructive">error: {m.error}</p>}
                {m.meta && <p className="text-muted-foreground">[{m.meta}]</p>}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {!messages.length && (
          <div className="flex flex-col items-start gap-1">
            {SUGGEST.map((s) => <button key={s} type="button" onClick={() => void send(s)} className="text-left text-muted-foreground hover:text-foreground">+ {s}</button>)}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-center gap-1.5">
          <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message the Twin agent" placeholder={listening ? "listening..." : "ask about a neighbourhood"}
            className="h-8 min-w-0 flex-1 border border-border bg-background px-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-primary" />
          {canListen && <button type="button" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start voice input"} className={cn(btn, listening && "border-primary text-primary")}>mic</button>}
          <button type="button" onClick={() => { setSpeak((s) => { if (s) window.speechSynthesis?.cancel(); return !s; }); }} aria-pressed={speak} aria-label="Read answers aloud" className={cn(btn, speak && "border-primary text-primary")}>read</button>
          {busy
            ? <button type="button" onClick={() => abortRef.current?.abort()} className={btn}>stop</button>
            : <button type="submit" disabled={!input.trim()} className="h-8 bg-primary px-3 font-mono text-xs text-primary-foreground disabled:opacity-50">send</button>}
        </form>
      </div>
    </div>
  );
}
