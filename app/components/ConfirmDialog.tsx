"use client";

// The shared "are you sure?" modal — replaces native window.confirm() for
// destructive actions (resign, delete, leave club…): styled, translated,
// focus-trapped, Escape-to-cancel, and able to spell out the consequence.
// Controlled: the parent owns `open` and both callbacks.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useT } from "../lib/i18n/LocaleProvider";

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  // Portalled to <body> so it always covers the viewport, even when opened
  // from inside a sticky/backdrop-blur ancestor (a containing block for
  // fixed descendants).
  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-[var(--panel)] p-5 shadow-2xl outline-none"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">{title}</h2>
        {body && <p className="text-sm text-[var(--muted)]">{body}</p>}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              danger
                ? "border border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                : "bg-[var(--accent)] text-[var(--on-accent)] shadow"
            }`}
          >
            {busy ? "…" : (confirmLabel ?? t("common.confirm"))}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
