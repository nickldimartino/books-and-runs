"use client";

import { useEffect, useRef } from "react";
import { isTypingTarget, matchShortcut, type ShortcutAction } from "./gameShortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Registers the game's global keyboard shortcuts (see gameShortcuts.ts) for as
 * long as the calling screen is mounted and `enabled`. Handlers are read from
 * a ref, so callers can pass fresh closures every render without re-binding.
 * Never fires while typing in a field, and never steals a key from a control
 * that already handled it (defaultPrevented).
 */
export function useGameShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      const action = matchShortcut(e);
      if (!action) return;
      const fn = ref.current[action];
      if (!fn) return;
      e.preventDefault();
      fn();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
