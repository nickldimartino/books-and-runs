"use client";

import { ReactNode, useEffect, useState } from "react";
import { dismissTip, isTipSeen, TipId } from "../lib/tipsStore";

interface PageTipProps {
  id: TipId;
  title: string;
  children: ReactNode;
}

/**
 * A first-visit-only dismissible banner — shown the first time someone
 * lands on the page it's placed on, gone for good (this device) once
 * dismissed; see tipsStore.ts. Reads the seen-flag in an effect rather than
 * useState's initializer so the first client render always matches the
 * server's "nothing yet" — otherwise a returning player's very first paint
 * would flash the tip before hiding it.
 */
export function PageTip({ id, title, children }: PageTipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isTipSeen(id));
  }, [id]);

  if (!visible) return null;

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-left"
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/20 text-[var(--accent)]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path
            d="M8 1.5a4.5 4.5 0 00-2.5 8.24c.35.24.5.6.5 1v.26a1 1 0 001 1h2a1 1 0 001-1v-.26c0-.4.15-.76.5-1A4.5 4.5 0 008 1.5z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path d="M6.5 14.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-[var(--heading)]">{title}</p>
        <p className="mt-0.5 text-[var(--muted)]">{children}</p>
      </div>
      <button
        onClick={() => {
          dismissTip(id);
          setVisible(false);
        }}
        aria-label="Dismiss tip"
        className="-m-1 shrink-0 rounded-full p-1.5 text-[var(--faint)] hover:bg-[var(--accent)]/20 hover:text-[var(--heading)]"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
