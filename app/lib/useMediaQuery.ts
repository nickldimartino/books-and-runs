"use client";

import { useSyncExternalStore } from "react";

/** Live `matchMedia` result. False on the server / first paint, then the real
 * value — safe for a static-export page whose game UI only renders after
 * mount anyway. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** ≥1024px: the two-column table + hand-dock layout (see game/page.tsx). */
export const WIDE_TABLE_QUERY = "(min-width: 1024px)";
