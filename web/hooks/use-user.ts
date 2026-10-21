"use client";
import { useStoredState } from "./use-stored-state";

/** A Twin username and its sync code, remembered in this browser. */
export interface TwinUser { name: string; code: string }
export interface SyncedHistory<C = unknown> { chats: (C & { id: string; at: number })[]; reports: { id: string; title: string; at: number }[] }

export function useTwinUser() {
  const [user, setUser, signOut] = useStoredState<TwinUser | null>("twin-user-v1", null);
  return { user, setUser, signOut };
}

const headers = (u: TwinUser) => ({ "content-type": "application/json", "x-twin-user": u.name, "x-twin-code": u.code });
async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
  return body as T;
}

export const nameAvailable = (name: string) => fetch(`/api/user?check=${encodeURIComponent(name)}`).then((r) => json<{ available: boolean; error?: string }>(r));
export const claimName = (name: string) => fetch("/api/user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => json<{ name: string; code: string }>(r));
export const signIn = <C,>(name: string, code: string) => fetch("/api/user", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, code }) })
  .then((r) => json<{ name: string; history: SyncedHistory<C> }>(r));
export const fetchHistory = <C,>(u: TwinUser) => fetch("/api/user", { headers: headers(u), cache: "no-store" }).then((r) => json<SyncedHistory<C>>(r));
export const pushHistory = (u: TwinUser, h: SyncedHistory) => fetch("/api/user", { method: "PUT", headers: headers(u), body: JSON.stringify(h) }).then((r) => json<{ ok: true }>(r));

/** Union by id, newest first. */
export function mergeHistory<C>(a: SyncedHistory<C>, b: SyncedHistory<C>, caps = { chats: 10, reports: 50 }): SyncedHistory<C> {
  const merge = <T extends { id: string; at: number }>(x: T[], y: T[], n: number) =>
    [...new Map([...x, ...y].sort((p, q) => p.at - q.at).map((v) => [v.id, v])).values()].sort((p, q) => q.at - p.at).slice(0, n);
  return { chats: merge(a.chats, b.chats, caps.chats), reports: merge(a.reports, b.reports, caps.reports) };
}
