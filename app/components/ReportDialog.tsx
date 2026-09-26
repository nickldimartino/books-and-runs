"use client";

// The report flow: pick a reason, optionally add a short note, send. The
// report lands in `user_reports` (migration 0060) for the developer to review
// — the reported player is never told. After sending, offers to block them.
// Controlled by the parent (`open` / `onClose`); rendered by SafetyMenu.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { translateError } from "../lib/i18n/serverErrors";
import {
  MAX_REPORT_NOTE_LENGTH,
  ReportContext,
  ReportReason,
  REPORT_REASONS,
  reportUser,
} from "../lib/safetyStore";
import { supabase } from "../lib/supabaseClient";

export function ReportDialog({
  open,
  targetUserId,
  targetName,
  context,
  gameId,
  photoOnly = false,
  onClose,
  onBlockRequested,
}: {
  open: boolean;
  targetUserId: string;
  targetName: string;
  context: ReportContext;
  gameId?: string | null;
  /** Reporting from the profile-photo affordance: only the photo reason. */
  photoOnly?: boolean;
  onClose: () => void;
  /** Called from the "block them too" button on the confirmation screen. */
  onBlockRequested?: () => void;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  const [reason, setReason] = useState<ReportReason | null>(photoOnly ? "inappropriate_photo" : null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason(photoOnly ? "inappropriate_photo" : null);
    setNote("");
    setState("idle");
    setError(null);
  }, [open, photoOnly, targetUserId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    if (!supabase || !reason) return;
    setState("sending");
    setError(null);
    try {
      await reportUser(supabase, { reportedUserId: targetUserId, reason, note, gameId, context });
      setState("sent");
    } catch (err) {
      // PostgrestError (thrown by reportUser) isn't an Error instance.
      const msg = (err as { message?: string } | null)?.message ?? "";
      setError(/too many/i.test(msg) ? translateError("Too many attempts — try again later.", t) : t("safety.report.error"));
      setState("error");
    }
  }

  const reasons = photoOnly ? (["inappropriate_photo"] as ReportReason[]) : REPORT_REASONS;

  // Portalled to <body>: a dialog opened from inside a sticky/backdrop-blur
  // ancestor (the opponent strip) would otherwise be positioned relative to
  // that ancestor instead of the viewport.
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
        aria-label={t("safety.report.title", { name: targetName })}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl outline-none"
      >
        {state === "sent" ? (
          <>
            <h2 className="text-base font-bold text-[var(--heading)]">{t("safety.report.sentTitle")}</h2>
            <p className="text-sm text-[var(--muted)]">{t("safety.report.sentBody", { name: targetName })}</p>
            <div className="flex gap-3">
              {onBlockRequested && (
                <button
                  onClick={() => {
                    onClose();
                    onBlockRequested();
                  }}
                  className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                >
                  {t("safety.report.alsoBlock", { name: targetName })}
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] shadow"
              >
                {t("common.done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-[var(--heading)]">{t("safety.report.title", { name: targetName })}</h2>
            <p className="text-xs text-[var(--faint)]">{t("safety.report.intro")}</p>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="sr-only">{t("safety.report.reasonLabel")}</legend>
              {reasons.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    reason === r
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--heading)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="accent-[var(--accent)]"
                  />
                  {t(`safety.reason.${r}` as TranslationKey)}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-xs text-[var(--faint)]">
              {t("safety.report.noteLabel")}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_REPORT_NOTE_LENGTH}
                rows={3}
                className="resize-none rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-[var(--danger)]">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={submit}
                disabled={!reason || state === "sending"}
                className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === "sending" ? t("safety.report.sending") : t("safety.report.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
