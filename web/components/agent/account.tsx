"use client";
import { useState } from "react";
import useSWR from "swr";
import { useDebounceValue } from "usehooks-ts";
import { cn } from "@/lib/utils";
import { claimName, nameAvailable, signIn, type SyncedHistory, type TwinUser } from "@/hooks/use-user";

/** Pick a username to keep chats and reports across devices. No password: a sync code proves it's yours. */
export function Account({ user, onUser, onSignOut, onHistory }: {
  user: TwinUser | null; onUser: (u: TwinUser) => void; onSignOut: () => void; onHistory: (h: SyncedHistory) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"claim" | "signin">("claim");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const clean = name.trim().toLowerCase();
  const [debounced] = useDebounceValue(clean, 350);
  const { data: check } = useSWR(mode === "claim" && debounced.length >= 3 ? ["name", debounced] : null, () => nameAvailable(debounced));

  if (user) return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground">signed in as <span className="text-foreground">{user.name}</span></span>
        <button type="button" onClick={onSignOut} className="ml-auto text-[10.5px] text-dim hover:text-foreground">sign out</button>
      </div>
      <p className="text-[10.5px] leading-relaxed text-dim">
        Sync code <button type="button" title="copy" onClick={() => { void navigator.clipboard?.writeText(user.code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="num border border-line px-1 text-foreground hover:border-primary">{user.code}</button> {copied ? "copied" : "— keep it: with your name it opens this history on another device."}
      </p>
    </div>
  );

  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (mode === "claim") { const r = await claimName(clean); onUser({ name: r.name, code: r.code }); }
      else { const r = await signIn(clean, code.trim()); onUser({ name: r.name, code: code.trim() }); onHistory(r.history); }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  };
  const status = mode === "signin" ? "" : clean.length < 3 ? "" : check?.error ?? (check ? (check.available ? "available" : "taken — if it's yours, sign in with its code") : "checking…");
  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-2">
      <p className="text-[10.5px] leading-relaxed text-dim">
        {mode === "claim" ? "Pick a username to keep your chats and reports on any device. No password or email." : "Enter your username and the sync code you got when you picked it."}
      </p>
      <div className="flex gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="username" aria-label="Username" maxLength={24} autoComplete="username"
          className="min-w-0 flex-1 border border-line bg-background px-2 py-1 text-[11.5px] outline-none focus:border-primary" />
        {mode === "signin" && <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="sync code" aria-label="Sync code" autoComplete="one-time-code"
          className="w-28 border border-line bg-background px-2 py-1 text-[11.5px] outline-none focus:border-primary" />}
        <button type="submit" disabled={busy || clean.length < 3 || (mode === "claim" ? check?.available !== true : !code.trim())}
          className="bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-30">{mode === "claim" ? "save" : "sign in"}</button>
      </div>
      <div className="flex items-baseline gap-2 text-[10.5px]">
        <span className={cn(check?.available ? "text-primary" : "text-dim", error && "text-destructive")}>{error || status}</span>
        <button type="button" onClick={() => { setMode(mode === "claim" ? "signin" : "claim"); setError(""); }} className="ml-auto text-dim hover:text-foreground">
          {mode === "claim" ? "already have a name?" : "pick a new name"}
        </button>
      </div>
    </form>
  );
}
