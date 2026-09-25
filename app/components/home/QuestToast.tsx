"use client";

import { useEffect } from "react";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../../lib/i18n/keys";
import { QUEST_CATALOG, QUEST_METRIC_LABEL_KEYS } from "@/quests";
import type { ClaimedQuest } from "../../lib/verifySoloGame";

const AUTO_DISMISS_MS = 7000;

/** A quest's translated label, by id — the toast and the game-over card both
 * only know the id/xp the server reported. */
export function questLabel(id: string, t: (key: TranslationKey) => string): string {
  const quest = QUEST_CATALOG.find((q) => q.id === id);
  return quest ? t((QUEST_METRIC_LABEL_KEYS[quest.metric] ?? "quests.metric.gamesPlayed") as TranslationKey) : id;
}

/** Celebration for quests the server just paid out. Same shape and
 * behaviour as UnlockToast (top banner, polite live region, auto-dismiss). */
export function QuestToast({ quests, onDismiss }: { quests: ClaimedQuest[]; onDismiss: () => void }) {
  const { t } = useT();
  useEffect(() => {
    if (quests.length === 0) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [quests, onDismiss]);

  if (quests.length === 0) return null;
  return (
    <div role="status" className="unlock-toast-pop fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex max-w-sm items-start gap-3 rounded-xl border border-[var(--accent)]/50 bg-[var(--panel)] p-4 text-left shadow-xl">
        <span className="text-2xl" aria-hidden="true">
          🎯
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--heading)]">{t("quests.toast.title")}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--muted)]">
            {quests.map((q) => (
              <li key={`${q.period}:${q.id}`}>{t("quests.toast.line", { quest: questLabel(q.id, t), xp: q.xp })}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t("common.dismiss")}
          className="shrink-0 rounded p-0.5 text-[var(--faint)] hover:text-[var(--muted)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
