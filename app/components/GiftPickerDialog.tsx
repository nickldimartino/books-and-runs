"use client";

// The "buy this for a friend" picker — opened from a Boutique item's gift
// button. Same portal/focus-trap/Escape shape as ReportDialog.tsx. Friends
// are passed in already loaded (BoutiqueContent.tsx fetches them once, not
// per-open) since re-fetching on every open would just be a spinner for
// data that rarely changes mid-session.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { Friend } from "../lib/friendsStore";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useT } from "../lib/i18n/LocaleProvider";
import { displayNameFor } from "../lib/leaderboardStore";

export function GiftPickerDialog({
  open,
  itemName,
  friends,
  loading,
  sending,
  onClose,
  onPick,
}: {
  open: boolean;
  itemName: string;
  friends: Friend[];
  loading: boolean;
  /** userId currently being gifted to, while the checkout redirect starts. */
  sending: string | null;
  onClose: () => void;
  onPick: (friend: Friend) => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("boutique.gift.title", { item: itemName })}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl outline-none"
      >
        <h2 className="text-base font-bold text-[var(--heading)]">{t("boutique.gift.title", { item: itemName })}</h2>
        <p className="text-xs text-[var(--faint)]">{t("boutique.gift.intro")}</p>

        {loading ? (
          <p className="py-4 text-center text-sm text-[var(--muted)]">{t("common.loading")}</p>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <p className="text-sm text-[var(--muted)]">{t("boutique.gift.noFriends")}</p>
            <Link
              href="/friends"
              onClick={onClose}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]"
            >
              {t("boutique.gift.addFriends")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {friends.map((f) => (
              <li key={f.userId}>
                <button
                  onClick={() => onPick(f)}
                  disabled={sending !== null}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm text-[var(--heading)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                >
                  <span className="truncate">{displayNameFor({ user_id: f.userId, display_name: f.displayName })}</span>
                  {sending === f.userId && <span className="text-xs text-[var(--muted)]">{t("common.loading")}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={onClose}
          className="mt-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>,
    document.body
  );
}
