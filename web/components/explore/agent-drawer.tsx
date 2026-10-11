"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Mic, MicOff, Send, Volume2, VolumeX, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentAction, AgentContext, AgentResponse, ChatMessage } from "@/lib/agent/types";

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

interface UiMessage extends ChatMessage { typing?: boolean }
const SUGGEST = ["Find the Silver Lake of Berlin", "Why do they match?", "Compare Shoreditch and Neukölln"];

export function AgentDrawer({ open, onOpenChange, context, onAction }: {
  open: boolean; onOpenChange: (o: boolean) => void; context: AgentContext; onAction: (a: AgentAction) => void;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([
    { role: "assistant", content: 'Ask me for the twin of any neighbourhood — try "find the Silver Lake of Berlin". I answer from the same data you see on the map.' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setCanListen(!!getRecognition()); return () => { if (timer.current) clearInterval(timer.current); window.speechSynthesis?.cancel(); }; }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  const typeOut = useCallback((full: string) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setMessages((m) => [...m, { role: "assistant", content: full }]); return; }
    let i = 0;
    setMessages((m) => [...m, { role: "assistant", content: "", typing: true }]);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      i = Math.min(full.length, i + 2);
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full.slice(0, i), typing: i < full.length }; return c; });
      if (i >= full.length && timer.current) clearInterval(timer.current);
    }, 16);
  }, []);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: UiMessage[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), context }),
      });
      const data = (await res.json()) as AgentResponse;
      typeOut(data.reply);
      data.actions?.forEach(onAction);
      if (speak && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(data.reply));
      }
    } catch {
      typeOut("Sorry, I couldn't reach the agent. Try again.");
    } finally { setBusy(false); }
  }, [busy, messages, context, typeOut, onAction, speak]);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="glass w-full gap-0 border-l border-white/10 bg-[#0a0b11]/90 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-white/10 p-4">
          <SheetTitle className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-lg bg-gradient-accent text-black"><Sparkles className="size-4" /></span> Twin agent</SheetTitle>
          <SheetDescription>Voice or text. Answers come straight from the taste data.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", m.role === "user" ? "bg-gradient-accent text-black" : "border border-white/10 bg-white/[0.05] text-white/90")}>
                {m.role === "assistant" && <Bot className="mb-1 size-3.5 text-cyan-300" aria-hidden />}
                {m.content}{m.typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-cyan-300" />}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-white/40">Thinking…</div>}
          <div ref={endRef} />
        </div>
        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="flex flex-wrap gap-1.5">
            {SUGGEST.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/70 transition hover:border-violet-400/60 hover:text-white">{s}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message the Twin agent" placeholder={listening ? "Listening…" : "Ask about a neighbourhood…"}
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60" />
            {canListen && (
              <Button type="button" size="icon" variant="outline" onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Start voice input"}
                className={cn("border-white/15", listening && "animate-pulse border-red-400/60 bg-red-500/20 text-red-200")}>
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
            <Button type="button" size="icon" variant="outline" onClick={() => { setSpeak((s) => { if (s) window.speechSynthesis?.cancel(); return !s; }); }} aria-pressed={speak} aria-label="Read answers aloud" className={cn("border-white/15", speak && "border-cyan-300/60 text-cyan-300")}>
              {speak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </Button>
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send" className="bg-gradient-accent text-black"><Send className="size-4" /></Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
