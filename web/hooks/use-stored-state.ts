"use client";
import { useRef, useState, type SetStateAction } from "react";
import { useEventCallback, useLocalStorage } from "usehooks-ts";

/** Keep edits in memory too: storage may be blocked or omit a visitor's unremembered key. */
export function useStoredState<T>(key: string, initial: T | (() => T), options?: Parameters<typeof useLocalStorage<T>>[2]) {
  const [stored, store, remove] = useLocalStorage(key, initial, {
    ...options, initializeWithValue: false,
    deserializer: (raw) => {
      try { return options?.deserializer ? options.deserializer(raw) : JSON.parse(raw) as T; }
      catch { return initial instanceof Function ? initial() : initial; }
    },
  });
  const [edit, setEdit] = useState<{ key: string; value: T }>();
  const latest = useRef(edit);
  const value = edit?.key === key ? edit.value : stored;
  const setValue = useEventCallback((update: SetStateAction<T>) => {
    store((stored) => {
      const previous = latest.current?.key === key ? latest.current.value : stored;
      const next = update instanceof Function ? update(previous) : update;
      latest.current = { key, value: next };
      setEdit(latest.current);
      return next;
    });
  });
  const reset = useEventCallback(() => {
    latest.current = { key, value: initial instanceof Function ? initial() : initial };
    setEdit(latest.current);
    try { remove(); } catch { /* storage blocked */ }
  });
  return [value, setValue, reset] as const;
}
