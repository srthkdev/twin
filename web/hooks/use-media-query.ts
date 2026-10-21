"use client";
import { useMediaQuery as useQuery } from "usehooks-ts";

export function useMediaQuery(q: string, server = true) {
  return useQuery(q, { defaultValue: server, initializeWithValue: false });
}
