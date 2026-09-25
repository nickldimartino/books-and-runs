"use client";

// Home's rotating daily + weekly quests. Display only: which quests are live
// is a pure function of the UTC day / ISO week (src/quests.ts), progress
// comes from server-verified counters (see app/lib/questsStore.ts), and XP is
// credited server-side the moment a quest completes — there's nothing to tap
// to "claim", so nothing to miss or be nagged about. Guests see the same
// quests with a sign-in prompt instead of progress.

import Link from "next/link";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../../lib/i18n/keys";
import { QuestPeriodView, splitDuration } from "../../lib/questsStore";
import { QUEST_METRIC_LABEL_KEYS, QuestStatus } from "@/quests";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** "2d 3h" / "5h 12m" / "8m", localised. */
export function formatResetsIn(ms: number, t: T): string {
  const { d, h, m } = splitDuration(ms);
  if (d > 0) return t("quests.time.dh", { d, h });
  if (h > 0) return t("quests.time.hm", { h, m });
  return t("quests.time.m", { m: Math.max(1, m) });
}

function QuestRow({ status, earning }: { status: QuestStatus; earning: boolean }) {
  const { t } = useT();
  const { quest, progress, claimed } = status;
  const label = t((QUEST_METRIC_LABEL_KEYS[quest.metric] ?? "quests.metric.gamesPlayed") as TranslationKey);
  const pct = Math.round((progress / quest.target) * 100);
  const done = claimed || (earning && status.complete);
  return (
    <li className="text-left">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`min-w-0 text-sm ${done ? "text-[var(--muted)]" : "font-medium text-[var(--heading)]"}`}>
          {done && (
            <span aria-hidden="true" className="mr-1 text-[var(--accent)]">
              ✓
            </span>
          )}
          {label}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-[var(--faint)]">
          {t("quests.progress", { progress, target: quest.target })}
          <span className="ml-2 font-semibold text-[var(--accent)]">{t("quests.xp", { xp: quest.xp })}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={quest.target}
        aria-valuenow={progress}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]"
      >
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export function QuestsCard({ views, earning, now }: { views: QuestPeriodView[]; earning: boolean; now: Date }) {
  const { t } = useT();
  return (
    <section
      aria-labelledby="quests-heading"
      className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3"
    >
      <h2 id="quests-heading" className="text-left text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
        {t("quests.title")}
      </h2>
      {views.map((view) => (
        <div key={view.period} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3 text-left">
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              {view.period === "daily" ? t("quests.daily") : t("quests.weekly")}
            </h3>
            <span className="text-[10px] text-[var(--faint)]">
              {t("quests.resets", { time: formatResetsIn(view.resetsAt - now.getTime(), t) })}
            </span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {view.statuses.map((s) => (
              <QuestRow key={s.quest.id} status={s} earning={earning} />
            ))}
          </ul>
        </div>
      ))}
      {!earning && (
        <p className="text-xs text-[var(--muted)]">
          {t("quests.signInHint")}{" "}
          <Link href="/sign-in" className="font-semibold text-[var(--accent)] hover:underline">
            {t("signIn.title")}
          </Link>
        </p>
      )}
    </section>
  );
}
