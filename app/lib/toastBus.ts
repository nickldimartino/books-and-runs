// The app-wide toast/snackbar trigger. Anything — a component, a store, a
// service-worker listener — calls `toast(...)`; components/ToastHost.tsx
// (mounted once in the root layout) renders it inside a single `role=status`
// live region so screen readers announce "Saved", "Link copied", "You're
// offline" consistently instead of each feature inventing its own status
// text. A plain window event (same pattern as accountSettingsSync's
// br:settings-synced) keeps senders decoupled from React and importable from
// non-component code.
//
// Pass a translation `key` (+ `vars`) rather than a sentence wherever the
// caller has no `t` — the host translates at render time, in the player's
// current language. `text` is for callers that already hold a translated
// string.

import type { TranslationKey } from "./i18n/keys";

export const TOAST_EVENT = "br:toast";
export const TOAST_DISMISS_EVENT = "br:toast-dismiss";

export type ToastKind = "success" | "info" | "error";

export interface ToastInput {
  /** Translation key — preferred. */
  key?: TranslationKey;
  vars?: Record<string, string | number>;
  /** An already-translated string (used when `key` is absent). */
  text?: string;
  kind?: ToastKind;
  /** ms before it clears itself; 0 = stays until dismissed (an "update
   * available" prompt). Default: 4000, or 7000 for errors. */
  duration?: number;
  /** Same `id` replaces an on-screen toast instead of stacking a duplicate. */
  id?: string;
  action?: { labelKey: TranslationKey; onClick: () => void };
}

export function toast(input: ToastInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail: input }));
}

export function dismissToast(id: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_DISMISS_EVENT, { detail: id }));
}

export const DEFAULT_TOAST_MS = 4000;
export const ERROR_TOAST_MS = 7000;
export const MAX_TOASTS = 3;

/** Adds a toast to the visible list: same-id replaces in place, the oldest
 * falls off past MAX_TOASTS. Pure so the stacking rules are testable. */
export function pushToast<T extends { id: string }>(list: T[], next: T): T[] {
  const without = list.filter((t) => t.id !== next.id);
  return [...without, next].slice(-MAX_TOASTS);
}
