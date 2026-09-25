"use client";

import { ReactNode, useEffect, useState } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
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
 * server's output. That output is the tip *visible* (a first visit is the
 * case that matters for layout stability: popping it in after hydration
 * shoved everything below it down — the Home page's CLS). A returning
 * visitor never sees it flash because public/init.js stamps
 * `data-seen-tips` on <html> before first paint and globals.css hides
 * `[data-tip]` for every listed id (tipsStore.ts keeps the attribute in
 * sync); this effect then removes the already-hidden node for real.
 */
export function PageTip({ id, title, children }: PageTipProps) {
  const { t } = useT();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(!isTipSeen(id));
  }, [id]);

  if (!visible) return null;

  return (
    <div
      role="note"
      data-tip={id}
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
        aria-label={t("common.dismissTip")}
        className="-m-1 shrink-0 rounded-full p-1.5 text-[var(--faint)] hover:bg-[var(--accent)]/20 hover:text-[var(--heading)]"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
