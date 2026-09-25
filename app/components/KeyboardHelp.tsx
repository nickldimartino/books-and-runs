"use client";

// The keyboard + gamepad shortcut sheet — opened by "?" (or the header
// button) on the game screens and from How to Play. One source of truth for
// the bindings: SHORTCUTS in lib/gameShortcuts.ts.

import { useRef } from "react";
import { SHORTCUTS } from "../lib/gameShortcuts";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useT } from "../lib/i18n/LocaleProvider";

export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  if (!open) return null;

  const padRows = [
    t("shortcuts.gamepad.move"),
    t("shortcuts.gamepad.select"),
    t("shortcuts.gamepad.back"),
    t("shortcuts.gamepad.draw"),
    t("shortcuts.gamepad.sort"),
    t("shortcuts.gamepad.zones"),
    t("shortcuts.gamepad.help"),
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Esc closes even though useGameShortcuts also maps it — this sheet can
      // be opened from How to Play, where that hook isn't mounted.
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "?") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcuts.title")}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[var(--heading)]">{t("shortcuts.title")}</h2>
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("common.close")}
          </button>
        </div>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("shortcuts.keyboardHeading")}
          </h3>
          <ul className="flex flex-col gap-2 text-sm">
            <li className="flex items-center justify-between gap-3 text-[var(--muted)]">
              <span>{t("shortcuts.moveFocus")}</span>
              <span className="flex shrink-0 gap-1">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3 text-[var(--muted)]">
              <span>{t("shortcuts.selectCard")}</span>
              <span className="flex shrink-0 gap-1">
                <Kbd>Enter</Kbd>
                <Kbd>Space</Kbd>
              </span>
            </li>
            {SHORTCUTS.map((s) => (
              <li key={s.action} className="flex items-center justify-between gap-3 text-[var(--muted)]">
                <span>{t(s.labelKey)}</span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--faint)]">{t("shortcuts.typingNote")}</p>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("shortcuts.gamepadHeading")}
          </h3>
          <ul className="flex flex-col gap-1.5 text-sm text-[var(--muted)]">
            {padRows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--panel-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--heading)]">
      {children}
    </kbd>
  );
}
