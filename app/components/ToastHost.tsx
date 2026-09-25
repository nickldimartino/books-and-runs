"use client";

// Renders toastBus.ts's toasts. One persistent `role="status"` /
// `aria-live="polite"` container that exists from first render (a live region
// must already be in the DOM for its later changes to be announced), stacked
// bottom-centre above the safe area. Errors use the same region — a polite
// announcement is enough for "couldn't sync"; nothing here steals focus.

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import {
  DEFAULT_TOAST_MS,
  ERROR_TOAST_MS,
  pushToast,
  TOAST_DISMISS_EVENT,
  TOAST_EVENT,
  type ToastInput,
} from "../lib/toastBus";

interface ActiveToast extends ToastInput {
  id: string;
}

let counter = 0;

export function ToastHost() {
  const { t } = useT();
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    function remove(id: string) {
      const timer = pending.get(id);
      if (timer) clearTimeout(timer);
      pending.delete(id);
      setToasts((list) => list.filter((x) => x.id !== id));
    }
    function onToast(e: Event) {
      const input = (e as CustomEvent<ToastInput>).detail;
      const id = input.id ?? `toast-${++counter}`;
      const existing = pending.get(id);
      if (existing) clearTimeout(existing);
      setToasts((list) => pushToast(list, { ...input, id }));
      const ms = input.duration ?? (input.kind === "error" ? ERROR_TOAST_MS : DEFAULT_TOAST_MS);
      if (ms > 0) pending.set(id, setTimeout(() => remove(id), ms));
      else pending.delete(id);
    }
    function onDismiss(e: Event) {
      remove((e as CustomEvent<string>).detail);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(TOAST_DISMISS_EVENT, onDismiss);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(TOAST_DISMISS_EVENT, onDismiss);
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  function dismiss(id: string) {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      {toasts.map((x) => {
        const message = x.key ? t(x.key, x.vars) : (x.text ?? "");
        const tone =
          x.kind === "error"
            ? "border-[var(--danger)]"
            : x.kind === "success"
              ? "border-[var(--accent)]"
              : "border-[var(--border)]";
        return (
          <div
            key={x.id}
            data-toast-kind={x.kind ?? "info"}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--heading)] shadow-xl ${tone}`}
          >
            <span className="min-w-0 flex-1">{message}</span>
            {x.action && (
              <button
                onClick={() => {
                  x.action?.onClick();
                  dismiss(x.id);
                }}
                className="shrink-0 rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-[var(--on-accent)]"
              >
                {t(x.action.labelKey)}
              </button>
            )}
            {(x.duration === 0 || x.action) && (
              <button
                onClick={() => dismiss(x.id)}
                aria-label={t("common.dismiss")}
                className="-mr-1 shrink-0 rounded-full px-2 py-1 text-[var(--faint)] hover:text-[var(--heading)]"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
