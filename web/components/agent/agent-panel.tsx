"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebounceCallback, useIsClient, useUnmount } from "usehooks-ts";
import useSWR from "swr";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import type { AgentAction } from "@/lib/agent/types";
import type { TwinUIMessage } from "@/lib/agent/ai";
import { AgentSettingsPanel } from "./agent-settings";
import { Elapsed, Pulse, ToolTrace, type ToolStep } from "./tool-trace";
import { ResultCard, hasCard } from "./result-cards";
import { emptySettings, type AgentSettings, type Health } from "./settings";
import { useStoredState } from "@/hooks/use-stored-state";
import { fetchHistory, mergeHistory, pushHistory, useTwinUser, type SyncedHistory, type TwinUser } from "@/hooks/use-user";
import { Account } from "./account";
import { useJson } from "@/hooks/use-json";
import { ReportView } from "./report-view";
import { runTour } from "@/components/tour/tour";
import { Chart, isChartSpec, streamingChart } from "./chart";
import { StreamingReport } from "@/components/report/streaming-report";

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

/** Past chats and reports, this browser only (there are no accounts; a report's share link is its key). */
const HISTORY_KEY = "twin-history-v1";
type HistoryChat = { title: string; chat: SavedChat };
type History = SyncedHistory<HistoryChat>;
const emptyHistory = (): History => ({ chats: [], reports: [] });
const chatTitle = (c: SavedChat) => c.messages.find((m) => m.role === "user")?.parts.map((p) => (p.type === "text" ? p.text : "")).join("").replace(/^make me a report:\s*/i, "").slice(0, 90) || "Untitled chat";

const REPORTS = [
  ["open a place", "Make me a report: Where in Berlin should I open a natural wine bar?"],
  ["expand", "Make me a report: My café works in Shoreditch, London. Where in New York should I open the next one?"],
  ["what's missing", "Make me a report: What thrives in the twins of Neukölln (Reuterkiez) abroad that is missing in Reuterkiez itself?"],
  ["move", "Make me a report: I love Silver Lake, Los Angeles. I'm moving to Berlin. Which neighbourhood should I choose?"],
  ["tour", "Make me a report: Where should Peso Pluma play in Europe? Compare London, Paris and Berlin."],
] as const;
const SUGGEST = [
  "Find the Silver Lake of Berlin",
  "What's the vibe of Shimokitazawa, Tokyo?",
  "Find the Shoreditch of Lisbon",
];

/** Split the model's closing "Next: a · b" line off the answer so it can render as buttons. */
function friendlyError(raw: string): string {
  let msg = raw;
  try { msg = (JSON.parse(raw) as { error?: string }).error ?? raw; } catch { /* plain text */ }
  if (/free-models-per-day|per day|daily/i.test(msg)) return "Today's free AI quota for this demo is used up. Add your own free OpenRouter key in settings and keep going — it takes a minute.";
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
  const end = useMemo(() => done ? Date.now() : undefined, [done]);
  const lines = text.trim().split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return (
    <details className="group my-1.5" open={!done ? true : undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] text-dim [&::-webkit-details-marker]:hidden">
        {done ? <><span className="inline-block w-3 text-center">◇</span><span>thought for <Elapsed from={since} to={end} /></span></>
          : <Pulse label="thinking"><span className="text-[11.5px] text-dim"><Elapsed from={since} /></span></Pulse>}
      </summary>
      {!done ? (
        <div className="relative ml-5 mt-1 h-[2.9em] overflow-hidden border-l border-line pl-2 text-[11.5px] leading-[1.45] text-dim [mask-image:linear-gradient(to_bottom,transparent,black_45%)]">
          <div className="absolute bottom-0 left-2 right-0">{lines.slice(-3).map((l, i) => <p key={lines.length - 3 + i} className="animate-in fade-in slide-in-from-bottom-1 duration-300 truncate">{l}</p>)}</div>
        </div>
      ) : (
        <p className="ml-5 mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap border-l border-line pl-2 text-[11.5px] leading-relaxed text-dim">{text.trim()}</p>
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
      if (o?.ok && hasCard(name)) last.cards = [...last.cards.filter((c) => c.name !== name || name === "chart" || name === "report"), { name, data: o.data, id: p.toolCallId }];
      else if (step.pending && (name === "report" || name === "chart")) last.cards.push({ name, data: p.input, id: p.toolCallId, pending: true });
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
  const charts = useMemo(() => m.parts.flatMap((p) => {
    if (!isToolUIPart(p) || getToolName(p) !== "chart" || p.state !== "output-available") return [];
    const output = p.output as { ok?: boolean; data?: unknown };
    if (!output.ok) return [];
    const data = output.data;
    const chart = isChartSpec(data) ? data : data && typeof data === "object" && "chart" in data && isChartSpec(data.chart) ? data.chart : null;
    return chart ? [chart] : [];
  }), [m]);
  const waiting = live && !m.parts.some((p) => isToolUIPart(p) && (p.state === "input-available" || p.state === "input-streaming"))
    && !m.parts.some((p) => p.type === "reasoning" && (p as { state?: string }).state !== "done");
  return (
    <div>
      {groups.map((g, j) => {
        if (g.kind === "thinking") return <Thinking key={j} text={g.text} done={g.done || !live} since={times.get(g.key)?.start ?? Date.now()} />;
        if (g.kind === "tools") return (
          <div key={j}>
            <ToolTrace steps={g.steps} folded={!live} />
            {g.cards.map((c) => {
              if (!c.pending) return <ResultCard key={c.id} name={c.name} data={c.data} onLink={onLink} onOpenReport={onReport} />;
              if (!live) return null;
              if (c.name === "report") return <StreamingReport key={c.id} input={c.data} charts={charts} onLink={onLink} />;
              const spec = streamingChart(c.data, c.id);
              return spec ? <div key={c.id} aria-busy="true"><p role="status" className="mt-3 text-[10.5px] text-dim">drawing chart…</p><Chart spec={spec} onLink={onLink} /></div> : null;
            })}
          </div>
        );
        const { body, next } = splitNext(g.text);
        return (
          <div key={j} className="break-words">
            <Markdown source={body} variant={reportView ? "article" : "chat"} onLink={onLink} />
            {!live && next.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {next.map((q) => <button key={q} type="button" onClick={() => onSend(q)} className="border border-line px-2 py-1 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-primary hover:text-primary">{q}</button>)}
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
        <p className="mt-2 text-[10.5px] text-dim">
          {[`qloo ${m.metadata.qlooLive} live · ${m.metadata.qlooCached} cached`, m.metadata.ms ? `${(m.metadata.ms / 1000).toFixed(1)}s` : ""].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
});

type Group =
  | { kind: "text"; text: string }
  | { kind: "tools"; steps: ToolStep[]; cards: { name: string; data: unknown; id: string; pending?: boolean }[] }
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
  const [settings, setSettings] = useStoredState<AgentSettings>("twin.agent.settings.v2", emptySettings, {
    serializer: (s) => JSON.stringify(s.remember ? s : { ...s, key: "" }),
    deserializer: (raw) => ({ ...emptySettings(), ...JSON.parse(raw) }),
  });
  const { data: health = null, error: healthError } = useJson<Health>("/api/agent/health");
  const [savedChat, saveChat, clearChat] = useStoredState<SavedChat | null>(CHAT_KEY, null);
  const [history, setHistory] = useStoredState<History>(HISTORY_KEY, emptyHistory);
  const [showHistory, setShowHistory] = useState(false);
  // With a username, history also lives in Blob: merge the server copy once per sign-in, then push changes (debounced).
  const { user, setUser, signOut } = useTwinUser();
  const { data: remote } = useSWR(user ? ["history", user.name] : null, () => fetchHistory<HistoryChat>(user!), { revalidateOnFocus: false });
  const mergedFor = useRef<string | null>(null);
  const push = useDebounceCallback((u: TwinUser, h: History) => { void pushHistory(u, h as SyncedHistory).catch(() => {}); }, 1500);
  useEffect(() => {
    if (!user || !remote || mergedFor.current === user.name) return;
    mergedFor.current = user.name;
    setHistory((h) => mergeHistory(h, remote));
  }, [user, remote, setHistory]);
  useEffect(() => { if (user && mergedFor.current === user.name) push(user, history); }, [user, history, push]);
  const [restored, setRestored] = useState(false);
  const isClient = useIsClient();
  const [showSettings, setShowSettings] = useState(false);
  const [input, setInput] = useState(initialInput ?? "");
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const canListen = isClient && !!getRecognition();
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { filename: string; markdown: string }[]>>({});
  const times = useRef(new Map<string, { start: number; end?: number }>());
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const live = useRef({ settings, context, onAction, user: null as TwinUser | null });
  live.current = { settings, context, onAction, user };

  const transport = useMemo(() => new DefaultChatTransport<TwinUIMessage>({
    api: "/api/agent",
    prepareSendMessagesRequest: ({ messages }) => {
      const { settings: s, context: ctx, user: u } = live.current;
      const headers: Record<string, string> = { ...(s.key ? { "x-agent-key": s.key } : {}), ...(u ? { "x-twin-user": u.name, "x-twin-code": u.code } : {}) };
      return { headers, body: { messages, context: ctx, model: s.model || undefined } };
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
        if (a.type === "report") setHistory((h) => ({ ...h, reports: [{ id: a.id, title: a.title, at: Date.now() }, ...h.reports.filter((r) => r.id !== a.id)].slice(0, 20) }));
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
  const lastAsk = [...messages].reverse().find((m) => m.role === "user")?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
  const reportAsked = /\b(report|plan|analysis|compare|deep dive)\b/i.test(lastAsk);

  useUnmount(() => { window.speechSynthesis?.cancel(); });
  // Restore the chat before allowing persistence or a new request.
  useEffect(() => {
    if (!isClient || restored) return;
    setRestored(true);
    if (!savedChat?.messages.length || initialInput?.trim()) return;
    times.current = new Map(savedChat.times);
    setFiles(savedChat.files ?? {});
    setMessages(savedChat.messages);
  }, [isClient, restored, savedChat, initialInput, setMessages]);
  // persist only between answers, never mid-stream
  useEffect(() => {
    if (!restored || (status !== "ready" && status !== "error")) return;
    const ids = new Set(messages.flatMap((m) => m.parts.map((p, i) => (isToolUIPart(p) ? p.toolCallId : `${m.id}:r${i}`))));
    if (messages.length) saveChat({ messages: messages.slice(-30), files, times: [...times.current].filter(([k]) => ids.has(k)) });
    else clearChat();
  }, [messages, status, files, restored, saveChat, clearChat]);
  const snapshot = useCallback((): SavedChat => ({ messages: messages.slice(-30), files, times: [...times.current] }), [messages, files]);
  const archive = useCallback(() => {
    if (!messages.length) return;
    const chat = snapshot(), id = messages[0].id;
    setHistory((h) => ({ ...h, chats: [{ id, title: chatTitle(chat), at: Date.now(), chat }, ...h.chats.filter((c) => c.id !== id)].slice(0, 10) }));
  }, [messages, snapshot, setHistory]);
  const newChat = useCallback(() => {
    if (busyRef.current) return;
    archive();
    setMessages([]); setFiles({}); setProgress({}); clearError(); times.current.clear(); clearChat();
  }, [archive, setMessages, clearError, clearChat]);
  const openChat = useCallback((id: string) => {
    const old = history.chats.find((c) => c.id === id);
    if (!old || busyRef.current) return;
    archive();
    times.current = new Map(old.chat.times); setFiles(old.chat.files ?? {}); setProgress({}); clearError();
    setMessages(old.chat.messages); setShowHistory(false);
  }, [history, archive, setMessages, clearError]);
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
    if (!restored || !external || external.t === lastExternal.current) return;
    lastExternal.current = external.t;
    if (status === "ready" || status === "error") void sendMessage({ text: external.text });
  }, [external, status, sendMessage, restored]);

  // A question in the link (?q=…, e.g. from the landing tasks) runs once as a fresh conversation, then leaves the URL.
  const autoSent = useRef(false);
  useEffect(() => {
    const q = initialInput?.trim();
    if (!restored || autoSent.current || !q) return;
    autoSent.current = true;
    setMessages([]); setFiles({}); times.current.clear(); setInput("");
    void sendMessage({ text: q });
    const u = new URL(window.location.href);
    u.searchParams.delete("q");
    window.history.replaceState(null, "", u.toString());
  }, [initialInput, sendMessage, setMessages, restored]);

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
    <div className={cn("flex h-full min-h-0 flex-col bg-background font-mono text-[12.5px] text-foreground", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-[11.5px] text-dim">
        <span className="min-w-0 truncate" title={modelLabel}>{modelLabel || "…"}</span>
        <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          {onViewChange && <button type="button" data-tour="view" aria-pressed={view === "report"} onClick={() => onViewChange(view === "report" ? "map" : "report")}
            title={view === "report" ? "Narrow the panel to see more map" : "Widen the panel for reading reports"}
            className={cn("border border-line px-1.5 py-0.5 transition-colors hover:text-foreground", view === "report" && "text-primary")}>{view === "report" ? "⤡ narrow" : "⤢ wide"}</button>}
          <button type="button" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className={cn("transition-colors hover:text-foreground", showHistory && "text-primary")}>{user ? user.name : "history"}</button>
          <button type="button" onClick={() => void runTour(reportId ? "report" : "explore", { force: true, delay: 0 })} className="transition-colors hover:text-foreground">guide</button>
          <button type="button" onClick={() => setSpeak((s) => { if (s) window.speechSynthesis?.cancel(); return !s; })} aria-pressed={speak} className={cn("transition-colors hover:text-foreground", speak && "text-primary")}>
            voice
          </button>
          {messages.length > 0 && <button type="button" onClick={newChat} disabled={busy} className="transition-colors hover:text-foreground disabled:opacity-40">new chat</button>}
          <button type="button" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} className="transition-colors hover:text-foreground">
            {showSettings ? "close" : "settings"}
          </button>
        </div>
      </div>
      {showSettings && <AgentSettingsPanel value={settings} onChange={setSettings} health={health} />}
      {showHistory && <div className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-b border-line px-3 py-3 text-[11.5px]">
        <Account user={user} onUser={setUser} onSignOut={() => { mergedFor.current = null; signOut(); }}
          onHistory={(h) => setHistory((cur) => mergeHistory(cur, h as History))} />
        {!user && <p className="text-[10.5px] leading-relaxed text-dim">Without a name, history stays in this browser. Reports also live at their share link, which anyone with the link can open.</p>}
        <div>
          <div className="label mb-1.5">reports</div>
          {history.reports.length ? history.reports.map((r) => <div key={r.id} className="flex items-baseline gap-2 border-t border-line py-1.5">
            <button type="button" onClick={() => { onAction({ type: "report", id: r.id, title: r.title }); setShowHistory(false); }} className="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-primary">{r.title}</button>
            <a href={`/r/${r.id}`} target="_blank" rel="noreferrer" className="shrink-0 text-[10.5px] text-dim hover:text-foreground">link ↗</a>
            <span className="num shrink-0 text-[10.5px] text-dim">{new Date(r.at).toLocaleDateString()}</span>
          </div>) : <p className="text-dim">No reports yet.</p>}
        </div>
        <div>
          <div className="label mb-1.5">earlier chats</div>
          {history.chats.length ? history.chats.map((c) => <div key={c.id} className="flex items-baseline gap-2 border-t border-line py-1.5">
            <button type="button" onClick={() => openChat(c.id)} disabled={busy} className="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-primary disabled:opacity-40">{c.title}</button>
            <span className="num shrink-0 text-[10.5px] text-dim">{new Date(c.at).toLocaleDateString()}</span>
          </div>) : <p className="text-dim">Start a new chat and this one is kept here.</p>}
        </div>
      </div>}
      {healthError && <p role="status" className="border-b border-line px-3 py-2 text-[11.5px] text-dim">Couldn’t load agent availability.</p>}

      <div className={cn("min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden", view === "report" ? "px-4 py-5 md:px-8 md:py-7" : "px-3 py-3")} aria-live="polite">
        {!messages.length && (
          <div className="space-y-5">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">Ask about any neighbourhood in the world: its twin elsewhere, where to go, where to open something, where an artist should play. Ask for a report to get a verdict, charts and a PDF.</p>
            <div>
              <div className="label mb-2">reports · a decision with the evidence</div>
              <div data-tour="reports" className={cn("grid gap-px border border-line bg-line", view === "report" && "sm:grid-cols-2")}>
                {REPORTS.map(([role, q]) => (
                  <button key={role} type="button" onClick={() => send(q)} className="group bg-background px-3 py-2.5 text-left transition-colors hover:bg-raised">
                    <span className="label text-[10px] text-primary">{role}</span>
                    <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground group-hover:text-foreground">{q.replace(/^Make me a report:\s*/, "")}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="label mb-2">quick questions</div>
              <div className="space-y-px border border-line bg-line">
                {SUGGEST.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="block w-full bg-background px-2.5 py-2 text-left text-[11.5px] text-muted-foreground transition-colors hover:bg-raised hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            {m.role === "user" ? (
              <div className="ml-6 border border-line bg-raised px-2.5 py-2 text-[12.5px] text-foreground">{m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</div>
            ) : (
              <MessageView m={m} live={busy && i === lastIdx} times={times.current} progress={busy && i === lastIdx ? progress : undefined}
                files={files[m.id] ?? (i === lastIdx ? files.last : undefined)} onLink={onLink} onSend={send} onSave={save} reportView={view === "report"}
                onReport={openReport} />
            )}
          </div>
        ))}
        {view === "report" && reportId && <ReportView id={reportId} onLink={onLink} />}
        {status === "submitted" && messages[lastIdx]?.role === "user" && <p><Pulse label="planning" /></p>}
        {busy && reportAsked && <p className="border-l border-line-strong pl-3 text-[11.5px] leading-relaxed text-dim">
          Reports take one to three minutes: the agent pulls live data, charts it and checks every number.{" "}
          {user ? "It keeps running if you close this tab and will be in your history." : <>It keeps running if you close this tab; <button type="button" onClick={() => setShowHistory(true)} className="underline decoration-dotted hover:text-foreground">pick a username</button> to find it in your history later.</>}
        </p>}
        {error && (
          <div className="flex items-start justify-between gap-3 border border-destructive/50 px-2.5 py-2 text-[11.5px] text-destructive">
            <span>{friendlyError(error.message)}</span>
            <button type="button" onClick={() => { clearError(); void regenerate(); }} className="shrink-0 border border-destructive/60 px-1.5 text-[11.5px] transition-colors hover:bg-destructive hover:text-background">retry</button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-line p-2.5">
        <div className="flex items-end gap-1 border border-line-strong bg-card px-2 py-1.5 transition-colors focus-within:border-primary">
          <textarea data-tour="ask" ref={taRef} value={input} rows={1} onChange={(e) => setInput(e.target.value)}
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
