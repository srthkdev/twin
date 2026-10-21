"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import type { AgentAction } from "@/lib/agent/types";
import type { TwinUIMessage } from "@/lib/agent/ai";
import { AgentSettingsPanel } from "./agent-settings";
import { Elapsed, Pulse, ToolTrace, type ToolStep } from "./tool-trace";
import { ResultCard, hasCard } from "./result-cards";
import { emptySettings, loadSettings, saveSettings, type AgentSettings, type Health } from "./settings";
import { ReportView } from "./report-view";

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

/** The conversation survives tab switches, panel collapses and reloads (this browser only). */
const CHAT_KEY = "twin-chat-v1";
interface SavedChat { messages: TwinUIMessage[]; files: Record<string, { filename: string; markdown: string }[]>; times: [string, { start: number; end?: number }][] }
function loadChat(): SavedChat | null {
  try { const raw = localStorage.getItem(CHAT_KEY); return raw ? (JSON.parse(raw) as SavedChat) : null; } catch { return null; }
}
function saveChat(c: SavedChat) {
  try { if (c.messages.length) localStorage.setItem(CHAT_KEY, JSON.stringify(c)); else localStorage.removeItem(CHAT_KEY); } catch { /* storage full or blocked */ }
}

const SUGGEST = [
  "Find the Silver Lake of Berlin",
  "I love Silver Lake. I'm moving to Neukölln — where do I actually go?",
  "Where in Berlin should I open a natural wine bar?",
  "Plan a 3-city European tour for Peso Pluma",
  "What's the vibe of Shimokitazawa, Tokyo?",
  "Find the Shoreditch of Lisbon",
];

/** Split the model's closing "Next: a · b" line off the answer so it can render as buttons. */
function friendlyError(raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: string }).error ?? raw; } catch { /* plain text */ }
  if (/rate|429|too many/i.test(msg)) return msg.length < 160 ? msg : "Too many questions in a short time. Wait a minute, or add your own OpenRouter key in settings.";
  if (/fetch|network|failed to/i.test(msg)) return "Lost the connection to the agent. Retry?";
  return msg.length < 200 ? msg : "The model didn't answer this time. Retry — it falls back to another free model.";
}

function splitNext(text: string): { body: string; next: string[] } {
  const m = text.match(/\n*\**Next:?\**:?\s*(.+)\s*$/i);
  if (!m) return { body: text, next: [] };
  return { body: text.slice(0, m.index).trimEnd(), next: m[1].split(/\s+·\s+|\s+\|\s+/).map((x) => x.replace(/[*"“”]/g, "").trim()).filter((x) => x.length > 3).slice(0, 3) };
}

/** The model's reasoning: a live, moving ticker while it thinks; a one-line "thought for Ns" afterwards. */
function Thinking({ text, done, since }: { text: string; done: boolean; since: number }) {
  const [end, setEnd] = useState<number | undefined>(undefined);
  useEffect(() => { if (done && !end) setEnd(Date.now()); }, [done, end]);
  const lines = text.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return (
    <details className="group my-1.5" open={!done ? true : undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] text-dim [&::-webkit-details-marker]:hidden">
        {done ? <><span className="inline-block w-3 text-center">◇</span><span>thought for <Elapsed from={since} to={end} /></span></>
          : <Pulse label="thinking"><span className="text-[11px] text-dim"><Elapsed from={since} /></span></Pulse>}
      </summary>
      {!done ? (
        <div className="relative ml-5 mt-1 h-[2.9em] overflow-hidden border-l border-line pl-2 text-[11px] leading-[1.45] text-dim [mask-image:linear-gradient(to_bottom,transparent,black_45%)]">
          <div className="absolute bottom-0 left-2 right-0">{lines.slice(-3).map((l, i) => <p key={lines.length - 3 + i} className="animate-in fade-in slide-in-from-bottom-1 duration-300 truncate">{l}</p>)}</div>
        </div>
      ) : (
        <p className="ml-5 mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap border-l border-line pl-2 text-[11px] leading-relaxed text-dim">{text.trim()}</p>
      )}
    </details>
  );
}

type Times = Map<string, { start: number; end?: number }>;

/** Turn a message's parts into render groups: thinking, tool steps (+ their result cards), and text. Pure. */
function buildGroups(m: TwinUIMessage, times: Times, progress: Record<string, string> | undefined): Group[] {
  const out: Group[] = [];
  m.parts.forEach((p, idx) => {
    if (isToolUIPart(p)) {
      const o = p.state === "output-available" ? (p.output as { ok?: boolean; summary?: string; data?: unknown }) : undefined;
      const t = times.get(p.toolCallId) ?? { start: Date.now() };
      const name = getToolName(p);
      const step: ToolStep = {
        id: p.toolCallId, name, args: p.input,
        pending: p.state === "input-streaming" || p.state === "input-available",
        ok: p.state === "output-error" ? false : o?.ok !== false,
        summary: p.state === "output-error" ? p.errorText : o?.summary,
        progress: progress?.[p.toolCallId], startedAt: t.start, endedAt: t.end,
      };
      let last = out[out.length - 1];
      if (last?.kind !== "tools") { last = { kind: "tools", steps: [], cards: [] }; out.push(last); }
      last.steps.push(step);
      if (o?.ok && hasCard(name)) last.cards = [...last.cards.filter((c) => c.name !== name), { name, data: o.data, id: p.toolCallId }];
    } else if (p.type === "reasoning" && p.text.trim()) {
      const last = out[out.length - 1];
      const done = (p as { state?: string }).state === "done";
      if (last?.kind === "thinking") { last.text += p.text; last.done = done; } else out.push({ kind: "thinking", text: p.text, done, key: `${m.id}:r${idx}` });
    } else if (p.type === "text" && p.text.trim()) {
      const last = out[out.length - 1];
      if (last?.kind === "text") last.text += p.text; else out.push({ kind: "text", text: p.text });
    }
  });
  return out;
}

/** One assistant message. Memoised: finished messages never re-render while the next answer streams. */
const MessageView = memo(function MessageView({ m, live, times, progress, files, onLink, onSend, onSave, onReport, reportView }: {
  m: TwinUIMessage; live: boolean; times: Times; progress?: Record<string, string>;
  files?: { filename: string; markdown: string }[]; onLink: (href: string) => void; onSend: (q: string) => void;
  onSave: (f: { filename: string; markdown: string }) => void; onReport?: (id: string, title: string) => void; reportView: boolean;
}) {
  const groups = useMemo(() => buildGroups(m, times, progress), [m, times, progress]);
  const waiting = live && !m.parts.some((p) => isToolUIPart(p) && (p.state === "input-available" || p.state === "input-streaming"))
    && !m.parts.some((p) => p.type === "reasoning" && (p as { state?: string }).state !== "done");
  return (
    <div>
      {groups.map((g, j) => {
        if (g.kind === "thinking") return <Thinking key={j} text={g.text} done={g.done || !live} since={times.get(g.key)?.start ?? Date.now()} />;
        if (g.kind === "tools") return (
          <div key={j}>
            <ToolTrace steps={g.steps} folded={!live} />
            {g.cards.map((c) => <ResultCard key={c.id} name={c.name} data={c.data} onLink={onLink} onOpenReport={onReport} />)}
          </div>
        );
        const { body, next } = splitNext(g.text);
        return (
          <div key={j} className="break-words">
            <Markdown source={body} variant={reportView ? "article" : "chat"} onLink={onLink} />
            {!live && next.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {next.map((q) => <button key={q} type="button" onClick={() => onSend(q)} className="border border-line px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">{q}</button>)}
              </div>
            )}
          </div>
        );
      })}
      {waiting && <p className="mt-2"><Pulse label={m.parts.length ? "writing" : "planning"} /></p>}
      {files?.map((f) => (
        <button key={f.filename} type="button" onClick={() => onSave(f)}
          className="mt-2 flex w-full items-center justify-between border border-primary/60 px-2.5 py-2 text-left text-[11.5px] text-primary transition-colors hover:bg-primary hover:text-primary-foreground">
          <span>↓ {f.filename}</span><span className="text-[10.5px] opacity-70">{Math.max(1, Math.round(f.markdown.length / 1024))} KB</span>
        </button>
      ))}
      {m.metadata && !live && (
        <p className="mt-2 text-[10px] text-dim">
          {[`qloo ${m.metadata.qlooLive} live · ${m.metadata.qlooCached} cached`, m.metadata.ms ? `${(m.metadata.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
});

type Group =
  | { kind: "text"; text: string }
  | { kind: "tools"; steps: ToolStep[]; cards: { name: string; data: unknown; id: string }[] }
  | { kind: "thinking"; text: string; done: boolean; key: string };

export function AgentPanel({ context, onAction, className, initialInput, external, view = "map", reportId, onViewChange }: {
  context: { fromHood: string | null; toCity: string | null; focus?: { lat: number; lon: number; label: string } | null };
  /** A question sent from elsewhere in the UI (e.g. the map's ask box); `t` changes per request. */
  external?: { text: string; t: number } | null;
  onAction: (a: AgentAction) => void;
  className?: string;
  initialInput?: string;
  view?: "map" | "report";
  reportId?: string | null;
  onViewChange?: (view: "map" | "report") => void;
}) {
  const [settings, setSettings] = useState<AgentSettings>(emptySettings);
  const [health, setHealth] = useState<Health | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState(initialInput ?? "");
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { filename: string; markdown: string }[]>>({});
  const times = useRef(new Map<string, { start: number; end?: number }>());
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const live = useRef({ settings, context, onAction });
  live.current = { settings, context, onAction };

  const transport = useMemo(() => new DefaultChatTransport<TwinUIMessage>({
    api: "/api/agent",
    prepareSendMessagesRequest: ({ messages }) => {
      const { settings: s, context: ctx } = live.current;
      return { headers: s.key ? { "x-agent-key": s.key } : undefined, body: { messages, context: ctx, model: s.model || undefined } };
    },
  }), []);

  const { messages, sendMessage, status, stop, error, setMessages, regenerate, clearError } = useChat<TwinUIMessage>({
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
        const txt = splitNext(message.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ")).body.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`#|◎]/g, "");
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
  useEffect(() => {
    const chat = loadChat();
    if (!chat?.messages.length) return;
    times.current = new Map(chat.times);
    setFiles(chat.files ?? {});
    setMessages(chat.messages);
  }, [setMessages]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  // persist only between answers, never mid-stream
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    const ids = new Set(messages.flatMap((m) => m.parts.map((p, i) => (isToolUIPart(p) ? p.toolCallId : `${m.id}:r${i}`))));
    saveChat({ messages: messages.slice(-30), files, times: [...times.current].filter(([k]) => ids.has(k)) });
  }, [messages, status, files]);
  const newChat = useCallback(() => {
    if (busyRef.current) return;
    setMessages([]); setFiles({}); setProgress({}); clearError(); times.current.clear(); saveChat({ messages: [], files: {}, times: [] });
  }, [setMessages, clearError]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, progress]);
  useEffect(() => {
    const t = taRef.current;
    if (t) { t.style.height = "0px"; t.style.height = `${Math.min(120, t.scrollHeight)}px`; }
  }, [input]);

  // stamp first/last-seen times per tool call and per reasoning block, so steps can show how long they took
  for (const m of messages) m.parts.forEach((p, idx) => {
    const key = isToolUIPart(p) ? p.toolCallId : p.type === "reasoning" ? `${m.id}:r${idx}` : null;
    if (!key) return;
    const t = times.current.get(key) ?? { start: Date.now() };
    const finished = isToolUIPart(p) ? p.state === "output-available" || p.state === "output-error" : (p as { state?: string }).state === "done";
    if (!t.end && finished) t.end = Date.now();
    times.current.set(key, t);
  });

  const lastExternal = useRef(0);
  useEffect(() => {
    if (!external || external.t === lastExternal.current) return;
    lastExternal.current = external.t;
    if (status === "ready" || status === "error") void sendMessage({ text: external.text });
  }, [external, status, sendMessage]);

  const busyRef = useRef(busy);
  busyRef.current = busy;
  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || busyRef.current) return;
    setInput("");
    void sendMessage({ text: t });
  }, [sendMessage]);
  const save = useCallback((f: { filename: string; markdown: string }) => saveMarkdown(f.filename, f.markdown), []);

  const onLink = useCallback((href: string) => {
    const kind = href.slice(0, href.indexOf(":")), rest = href.slice(href.indexOf(":") + 1);
    if (kind === "hood") live.current.onAction({ type: "focusHood", hood: rest });
    if (kind === "geo") {
      const [lat, lon] = rest.split(",").map(Number);
      if (isFinite(lat) && isFinite(lon)) live.current.onAction({ type: "focus", lat, lon });
    }
  }, []);
  const openReport = useCallback((id: string, title: string) => onAction({ type: "report", id, title }), [onAction]);

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

  const modelLabel = (settings.model || health?.openrouter.models[0] || "").replace(/^[a-z-]+\//, "").replace(/:free$/, "");
  const lastIdx = messages.length - 1;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background font-mono text-xs text-foreground", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[11px] text-dim">
        <span className="truncate">{modelLabel || "…"}</span>
        <div className="flex items-center gap-3">
          {onViewChange && <div role="group" aria-label="Explore layout" className="flex items-center border border-line">
            {(["map", "report"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => onViewChange(mode)}
              className={cn("px-1.5 py-0.5 transition-colors", view === mode ? "bg-raised text-primary" : "hover:text-foreground")}>{mode}</button>)}
          </div>}
          <button type="button" onClick={() => setSpeak((s) => { if (s) window.speechSynthesis?.cancel(); return !s; })} aria-pressed={speak} className={cn("transition-colors hover:text-foreground", speak && "text-primary")}>
            voice {speak ? "on" : "off"}
          </button>
          {messages.length > 0 && <button type="button" onClick={newChat} disabled={busy} className="transition-colors hover:text-foreground disabled:opacity-40">new chat</button>}
          <button type="button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} className="transition-colors hover:text-foreground">
            {showSettings ? "close" : "settings"}
          </button>
        </div>
      </div>
      {showSettings && <AgentSettingsPanel value={settings} onChange={setSettings} health={health} />}

      <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto", view === "report" ? "px-4 py-5 md:px-8 md:py-7" : "px-3 py-3")} aria-live="polite">
        {!messages.length && (
          <div className="space-y-4">
            <p className="text-[12px] leading-relaxed text-muted-foreground">Ask about any neighbourhood in the world: its twin elsewhere, where to go, where to open something, where an artist should play.</p>
            <div className="space-y-px border border-line bg-line">
              {SUGGEST.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="block w-full bg-background px-2.5 py-2 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            {m.role === "user" ? (
              <div className="ml-6 border border-line bg-raised px-2.5 py-2 text-[12px] text-foreground">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</div>
            ) : (
              <MessageView m={m} live={busy && i === lastIdx} times={times.current} progress={busy && i === lastIdx ? progress : undefined}
                files={files[m.id] ?? (i === lastIdx ? files.last : undefined)} onLink={onLink} onSend={send} onSave={save} reportView={view === "report"}
                onReport={openReport} />
            )}
          </div>
        ))}
        {view === "report" && reportId && <ReportView id={reportId} onLink={onLink} />}
        {status === "submitted" && messages[lastIdx]?.role === "user" && <p><Pulse label="planning" /></p>}
        {error && (
          <div className="flex items-start justify-between gap-3 border border-destructive/50 px-2.5 py-2 text-[11.5px] text-destructive">
            <span>{friendlyError(error.message)}</span>
            <button type="button" onClick={() => { clearError(); void regenerate(); }} className="shrink-0 border border-destructive/60 px-1.5 text-[11px] transition-colors hover:bg-destructive hover:text-background">retry</button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-line p-2.5">
        <div className="flex items-end gap-1 border border-line-strong bg-card px-2 py-1.5 transition-colors focus-within:border-primary">
          <textarea ref={taRef} value={input} rows={1} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            aria-label="Message the Twin agent" placeholder={listening ? "listening…" : "ask about any neighbourhood…"}
            className="max-h-[120px] min-h-[22px] flex-1 resize-none bg-transparent py-0.5 text-[12.5px] leading-[1.45] outline-none placeholder:text-dim" />
          {canListen && (
            <button type="button" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Voice input"}
              className={cn("grid size-6 shrink-0 place-items-center transition-colors", listening ? "text-primary" : "text-dim hover:text-foreground")}>
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" /><path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2" /></svg>
            </button>
          )}
          {busy ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop" className="grid size-6 shrink-0 place-items-center border border-line-strong text-foreground hover:border-foreground">
              <span className="size-2 bg-current" />
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} aria-label="Send" className="grid size-6 shrink-0 place-items-center bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
