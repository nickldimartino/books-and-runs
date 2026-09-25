"use client";

// A small "⋯" menu for any other player's row (friends list, MP table, club /
// tournament standings, profile, leaderboard): Report, and Block / Unblock.
// Blocking asks for confirmation through the shared ConfirmDialog and, on
// success, tells the parent so it can drop the player from its list.

import { useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n/LocaleProvider";
import { blockUser, ReportContext } from "../lib/safetyStore";
import { supabase } from "../lib/supabaseClient";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReportDialog } from "./ReportDialog";

export function SafetyMenu({
  targetUserId,
  targetName,
  context,
  gameId,
  onBlocked,
  className = "",
  photoOnlyReport = false,
}: {
  targetUserId: string;
  targetName: string;
  context: ReportContext;
  gameId?: string | null;
  /** Called after a successful block. */
  onBlocked?: (userId: string) => void;
  className?: string;
  photoOnlyReport?: boolean;
}) {
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function doBlock() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await blockUser(supabase, targetUserId);
      setConfirmingBlock(false);
      onBlocked?.(targetUserId);
    } catch (err) {
      console.error("Failed to block:", err);
      setError(t("safety.block.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span ref={wrapRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={t("safety.menu.aria", { name: targetName })}
        title={t("safety.menu.title")}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-base leading-none text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--heading)]"
      >
        ⋯
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 flex min-w-[9rem] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm shadow-xl"
        >
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setReporting(true);
            }}
            className="px-3 py-2 text-left text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("safety.menu.report")}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirmingBlock(true);
            }}
            className="px-3 py-2 text-left text-[var(--danger)] hover:bg-[var(--panel-soft)]"
          >
            {t("safety.menu.block")}
          </button>
        </div>
      )}
      <ReportDialog
        open={reporting}
        targetUserId={targetUserId}
        targetName={targetName}
        context={context}
        gameId={gameId}
        photoOnly={photoOnlyReport}
        onClose={() => setReporting(false)}
        onBlockRequested={() => setConfirmingBlock(true)}
      />
      <ConfirmDialog
        open={confirmingBlock}
        danger
        busy={busy}
        title={t("safety.block.confirmTitle", { name: targetName })}
        body={error ?? t("safety.block.confirmBody")}
        confirmLabel={t("safety.menu.block")}
        onConfirm={doBlock}
        onCancel={() => {
          setConfirmingBlock(false);
          setError(null);
        }}
      />
    </span>
  );
}
