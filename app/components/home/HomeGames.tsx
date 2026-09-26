"use client";

// Home's "Your games": the most actionable content on the page. The local
// saved game (tagged Solo / Pass & play), every active multiplayer game
// (your-turn ones first, waiting-on-someone ones dimmed below), and any
// pending game invites with Accept / Decline inline. Renders nothing when
// there's nothing to show — the section collapses instead of leaving a blank
// slot. While the multiplayer games load for a signed-in visitor a same-shaped
// skeleton holds the space (hidden pre-paint for guests via
// `data-home-games-skeleton`, see globals.css).

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatRemaining, timerState } from "@/mp/turnTimer";
import { useT } from "../../lib/i18n/LocaleProvider";
import { MpGameSummary, respondToMpGame } from "../../lib/mpStore";
import { loadSupabase } from "../../lib/supabaseClient";
import type { useNotifications } from "../../lib/useNotifications";

const HAD_GAMES_KEY = "booksAndRuns:hadMpGames";

export function opponentNames(g: MpGameSummary): string {
  return g.seats
    .filter((s) => s.seat !== g.your_seat)
    .map((s) => s.name)
    .join(", ");
}

/** Whole days since a timestamp, or null if under 2 (not worth showing). */
function daysStale(iso: string): number | null {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isFinite(d) && d >= 2 ? d : null;
}

function MpGameRow({ g, yourTurn, dimmed }: { g: MpGameSummary; yourTurn: boolean; dimmed: boolean }) {
  const { t } = useT();
  const turnName = g.seats.find((s) => s.seat === g.turn_seat)?.name;
  const stale = daysStale(g.updated_at);
  // Turn-clock chip (migration 0061): only on an active game with a limit.
  const clock =
    g.status === "active" ? timerState(Date.now(), g.turn_started_at ? Date.parse(g.turn_started_at) : null, g.turn_limit_hours ?? 0) : null;
  const clockLeft = clock && clock.phase !== "off" && clock.phase !== "expired" ? formatRemaining(clock.remainingMs) : null;
  const chip =
    g.status === "pending"
      ? t("home.waitingToStart")
      : yourTurn
        ? t("home.yourTurn")
        : t("home.waitingForName", { name: turnName ?? "…" });
  return (
    <Link
      href={`/multiplayer/play?g=${g.game_id}`}
      className={`flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left transition hover:bg-[var(--panel-soft)] ${
        dimmed ? "opacity-55 hover:opacity-100" : ""
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-base font-semibold text-[var(--heading)]">
          {opponentNames(g) || t("home.multiplayerGame")}
        </span>
        <span className="block text-xs text-[var(--faint)]">
          {t("game.roundOf", { round: g.round, total: g.total_rounds })}
          {clock && clock.phase !== "off" && (
            <span
              className={
                clock.phase === "expired" ? "text-[var(--danger)]" : clock.phase === "warn" ? "text-amber-500" : undefined
              }
            >
              {" · "}
              {clockLeft
                ? t("home.turnEndsIn", { time: t(`turnTimer.unit.${clockLeft.unit}`, { n: clockLeft.value }) })
                : t("home.turnOverdue")}
            </span>
          )}
          {stale != null && !yourTurn && (
            <span className={stale >= 14 ? "text-[var(--danger)]" : undefined}>
              {" · "}
              {stale >= 14 ? t("home.noMovesInDays", { days: stale }) : t("home.daysAbbr", { days: stale })}
            </span>
          )}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
          yourTurn ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--panel-soft)] text-[var(--muted)]"
        }`}
      >
        {chip}
      </span>
    </Link>
  );
}

/**
 * Games that want you: every active multiplayer game (your-turn ones first,
 * waiting-on-someone ones dimmed below) and any pending game invites with
 * Accept / Decline inline. The local saved game is the Play zone's Continue
 * button, not a row here. Renders nothing when there's nothing to show.
 */
export function HomeGames({
  notifications,
  userId,
}: {
  notifications: ReturnType<typeof useNotifications>;
  userId: string | undefined;
}) {
  const { t, tPlural } = useT();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  const invites = notifications.mpGames.filter((g) => g.invite_status === "invited");
  const mine = notifications.mpGames.filter((g) => g.invite_status === "accepted");
  const yourTurn = mine.filter((g) => g.status === "active" && g.turn_user_id === userId);
  const waiting = mine.filter((g) => !(g.status === "active" && g.turn_user_id === userId));

  // Multiplayer games load async (notifications.loading). Without a
  // placeholder a signed-in visitor with real games would see nothing here for
  // a beat, then have the whole section pop in and shove everything below it
  // down; a same-shaped skeleton row holds that space. It is only worth
  // holding when the last visit had games (`data-had-games`, stamped by
  // public/init.js from the flag below) — otherwise the skeleton itself would
  // be the layout shift when it vanished.
  const hasAny = invites.length + mine.length > 0;
  useEffect(() => {
    if (notifications.loading) return;
    try {
      if (hasAny) localStorage.setItem(HAD_GAMES_KEY, "1");
      else localStorage.removeItem(HAD_GAMES_KEY);
      if (hasAny) document.documentElement.setAttribute("data-had-games", "1");
      else document.documentElement.removeAttribute("data-had-games");
    } catch {
      /* best-effort */
    }
  }, [notifications.loading, hasAny]);

  if (notifications.loading) {
    return (
      // data-home-games-skeleton: hidden unless html[data-signed-in][data-had-games]
      // (init.js) — see above.
      <section className="flex flex-col gap-2" data-home-games-skeleton>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("home.yourGames")}</h2>
        <div className="h-[60px] animate-pulse rounded-lg border border-[var(--border)] bg-[var(--panel)]" />
      </section>
    );
  }

  if (invites.length === 0 && mine.length === 0) return null;

  async function respond(gameId: string, accept: boolean) {
    const client = await loadSupabase();
    if (!client) return;
    setBusyId(gameId);
    setRespondError(null);
    try {
      await respondToMpGame(client, gameId, accept);
      notifications.refresh();
    } catch {
      setRespondError(t("home.respondError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("home.yourGames")}</h2>

      {respondError && <p className="text-xs text-[var(--danger)]">{respondError}</p>}

      {invites.map((g) => (
        <div key={g.game_id} className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-left">
          <p className="text-sm font-medium text-[var(--heading)]">
            {t("home.invitedYou", { name: opponentNames(g) || t("home.someone") })}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {g.total_rounds === 7 ? t("home.fullGame") : tPlural("home.roundGame", g.total_rounds)}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => respond(g.game_id, true)}
              disabled={busyId === g.game_id}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {t("multiplayer.accept")}
            </button>
            <button
              onClick={() => respond(g.game_id, false)}
              disabled={busyId === g.game_id}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {t("multiplayer.decline")}
            </button>
          </div>
        </div>
      ))}

      {yourTurn.map((g) => (
        <MpGameRow key={g.game_id} g={g} yourTurn dimmed={false} />
      ))}
      {waiting.map((g) => (
        <MpGameRow key={g.game_id} g={g} yourTurn={false} dimmed />
      ))}
    </section>
  );
}

