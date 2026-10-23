"use client";
import useSWR, { type SWRConfiguration } from "swr";

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export function useJson<T>(key: string | null, load: (url: string) => Promise<T> = fetchJson<T>, config?: SWRConfiguration<T, Error>) {
  return useSWR<T, Error>(key, load, { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, ...config });
}
