"use client";

import { useMemo, useSyncExternalStore } from "react";

/** The store never changes; the date is read fresh on each render pass. */
const subscribe = () => () => {};

/**
 * Today's date, read on the client rather than during server render.
 *
 * Two reasons this is not just `new Date()` inline. Reading the clock during
 * render is impure, and these pages are statically generated — a threshold read
 * at build time would be frozen into the HTML, which is precisely the failure
 * the dated regulatory configuration exists to prevent. `useSyncExternalStore`
 * is the sanctioned way to read a client-only value: the server snapshot is the
 * build date, and hydration replaces it with the real one.
 *
 * The snapshot is an ISO day string rather than a `Date` so React's identity
 * comparison is stable — a fresh `Date` object every call would loop.
 */
export function useToday(fallbackIso: string): Date {
  const day = useSyncExternalStore(
    subscribe,
    () => new Date().toISOString().slice(0, 10),
    () => fallbackIso.slice(0, 10),
  );
  return useMemo(() => new Date(`${day}T00:00:00Z`), [day]);
}
