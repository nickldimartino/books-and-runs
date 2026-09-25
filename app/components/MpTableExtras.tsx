"use client";

// A small addition under the MP board: a "Players" list where any human
// opponent can be reported or blocked.

import type { RedactedPlayer } from "@/mp/types";
import { useT } from "../lib/i18n/LocaleProvider";
import { SafetyMenu } from "./SafetyMenu";

export function MpTableExtras({
  gameId,
  players,
  myUserId,
  onBlocked,
}: {
  gameId: string;
  players: RedactedPlayer[];
  myUserId: string | undefined;
  onBlocked?: () => void;
}) {
  const { t } = useT();
  const others = players.filter((p) => !p.isAI && p.userId && p.userId !== myUserId);
  if (others.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-[var(--panel-soft)] p-3">
      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer">{t("safety.players.heading")}</summary>
        <ul className="mt-1 flex flex-col gap-1">
          {others.map((p) => (
            <li key={p.seat} className="flex items-center justify-between rounded-lg bg-[var(--panel)] px-3 py-1.5">
              <span className="truncate text-[var(--heading)]">{p.name}</span>
              <SafetyMenu
                targetUserId={p.userId!}
                targetName={p.name}
                context="mp_game"
                gameId={gameId}
                onBlocked={() => onBlocked?.()}
              />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
