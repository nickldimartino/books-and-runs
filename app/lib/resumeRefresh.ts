"use client";

// "The app just came back" detection, shared by the MP game screen
// (useMpGame) and the Home notification badge (useNotifications).
//
// Postgres-changes realtime only tells you about things that happen while the
// socket is alive. Phones freeze background tabs and drop the websocket, so a
// player returning to the app could stare at a stale board/badge until they
// acted — the ordered-refresh logic in useMpGame protects against stale
// *responses*, not against *missed events*. So on visibilitychange→visible,
// window focus, pageshow (bfcache restore) and `online` we re-fetch, and
// re-open the realtime channel if it died while we were away. Bursts of these
// events (focus + visibilitychange fire together) coalesce into one call.

import { useEffect, useRef } from "react";

export const RESUME_DEBOUNCE_MS = 400;

/** RealtimeChannel states that mean "this will not deliver events any more". */
export function isChannelDead(state: unknown): boolean {
  return state === "closed" || state === "errored";
}

export function useResumeRefresh(onResume: () => void, enabled = true, debounceMs = RESUME_DEBOUNCE_MS): void {
  const cb = useRef(onResume);
  cb.current = onResume;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        cb.current();
      }, debounceMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fire();
    };
    const onPageShow = (e: Event) => {
      if ((e as PageTransitionEvent).persisted) fire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fire);
    window.addEventListener("online", fire);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", fire);
      window.removeEventListener("online", fire);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled, debounceMs]);
}
