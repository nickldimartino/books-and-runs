"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside `ref` while `active`, and restores it to
 * whatever was focused before on deactivation. Tab / Shift+Tab wrap at the
 * edges. Use for modal dialogs (the hand drawer, buy-offer prompt, …) so a
 * keyboard or screen-reader user can't tab out onto the page behind them.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus in.
    const first = focusables()[0];
    (first ?? container).focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === firstEl || !ref.current?.contains(activeEl))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    // If focus somehow escapes (a click outside, a removed element), pull it back.
    function onFocusIn(e: FocusEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) {
        (focusables()[0] ?? el).focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}
