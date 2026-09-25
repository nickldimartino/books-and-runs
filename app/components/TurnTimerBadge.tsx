"use client";

// "Turn ends in 14h" — the per-game turn clock (src/mp/turnTimer.ts) as a
// small pill. Amber in the last quarter, red once expired. Renders nothing
// when the game has no limit. Ticks once a minute.

import { useEffect, useState } from "react";
import { formatRemaining, timerState } from "@/mp/turnTimer";
import { useT } from "../lib/i18n/LocaleProvider";

export function TurnTimerBadge({
  turnLimitHours,
  turnStartedAt,
  isMine,
  missedTurns = 0,
}: {
  turnLimitHours: number;
  turnStartedAt: string | null;
  isMine: boolean;
  missedTurns?: number;
}) {
  const { t } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const st = timerState(now, turnStartedAt ? Date.parse(turnStartedAt) : null, turnLimitHours);
  if (st.phase === "off") return null;
  const r = formatRemaining(st.remainingMs);
  const label =
    st.phase === "expired"
      ? t("turnTimer.expired")
      : t(isMine ? "turnTimer.yourEnds" : "turnTimer.theirEnds", { time: t(`turnTimer.unit.${r.unit}`, { n: r.value }) });
  const tone =
    st.phase === "expired"
      ? "bg-[var(--danger)]/15 text-[var(--danger)]"
      : st.phase === "warn"
        ? "bg-amber-500/15 text-amber-500"
        : "bg-[var(--panel-soft)] text-[var(--muted)]";
  return (
    <div className="flex flex-col items-center gap-1">
      <span role="timer" className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
        ⏳ {label}
      </span>
      {isMine && missedTurns > 0 && (
        <span className="text-xs text-[var(--danger)]">{t("turnTimer.lastChance")}</span>
      )}
    </div>
  );
}
