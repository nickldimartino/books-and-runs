"use client";

// The bell in Home's top-right corner: an unread badge (capped "9+") and a
// dialog listing everything that wants the player — games where it's their
// turn (with the turn-clock), game invites (Accept/Decline), friend
// requests, a fresh streak-shield save and quests paid out this visit — plus
// a soft "enable push" ask and a link to the notification settings. It reads
// the SAME data as the Home chips (useNotifications, passed in so the page
// keeps one Realtime channel). "Seen" is remembered per account locally:
// opening the bell clears the badge, never the items themselves.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRemaining, timerState } from "@/mp/turnTimer";
import { useFocusTrap } from "../lib/useFocusTrap";
import { useT } from "../lib/i18n/LocaleProvider";
import type { MpGameSummary } from "../lib/mpStore";
import { respondToMpGame } from "../lib/mpStore";
import {
  badgeLabel,
  buildNotificationItems,
  loadSeen,
  markSeen,
  NotificationItem,
  unseenCount,
} from "../lib/notificationItems";
import { getPushPermission, isPushSubscribed, isPushSupported, subscribeToPush } from "../lib/pushSubscriptions";
import { loadSupabase } from "../lib/supabaseClient";
import type { Notifications } from "../lib/useNotifications";
import type { ClaimedQuest } from "../lib/verifySoloGame";
import { questLabel } from "./home/QuestToast";

function names(g: MpGameSummary): string {
  return g.seats
    .filter((s) => s.seat !== g.your_seat)
    .map((s) => s.name)
    .join(", ");
}

export function NotificationBell({
  userId,
  notifications,
  shieldSaveDay = null,
  claimedQuests = [],
  className = "fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-40",
}: {
  userId: string | null;
  notifications: Pick<Notifications, "friendRequests" | "mpGames" | "refresh">;
  shieldSaveDay?: string | null;
  claimedQuests?: ClaimedQuest[];
  /** Positioning of the bell's wrapper (the dialog anchors to it). Defaults
   * to a fixed top-right corner; Home's top bar places it inline instead. */
  className?: string;
}) {
  const { t, tPlural } = useT();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  // The seen set as it was when the dialog opened — lets rows that were new
  // keep their dot while the badge itself has already cleared.
  const [freshAtOpen, setFreshAtOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState(false);
  const [push, setPush] = useState<"hidden" | "ask" | "busy" | "error">("hidden");
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(panelRef, open);

  const items = useMemo(
    () =>
      buildNotificationItems({
        userId,
        games: notifications.mpGames,
        friendRequests: notifications.friendRequests,
        shieldSaveDay,
        claimedQuests,
      }),
    [userId, notifications.mpGames, notifications.friendRequests, shieldSaveDay, claimedQuests]
  );

  useEffect(() => {
    setSeen(userId ? loadSeen(userId) : new Set());
  }, [userId]);

  const unseen = unseenCount(items, seen);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Soft-ask for push only where it can work and isn't already on/denied.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    if (!isPushSupported() || getPushPermission() !== "default") {
      setPush("hidden");
      return;
    }
    isPushSubscribed().then((on) => {
      if (!cancelled) setPush(on ? "hidden" : "ask");
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  // Guests only get a bell when there's something to show (there never is
  // today — every source is account data — but the rule is cheap to keep).
  if (!userId && items.length === 0) return null;

  function toggle() {
    if (open) {
      close();
      return;
    }
    setFreshAtOpen(new Set(items.filter((i) => !seen.has(i.id)).map((i) => i.id)));
    if (userId) setSeen(markSeen(userId, items.map((i) => i.id)));
    setRespondError(false);
    setOpen(true);
  }

  async function respond(gameId: string, accept: boolean) {
    const client = await loadSupabase();
    if (!client) return;
    setBusyId(gameId);
    setRespondError(false);
    try {
      await respondToMpGame(client, gameId, accept);
      notifications.refresh();
    } catch {
      setRespondError(true);
    } finally {
      setBusyId(null);
    }
  }

  async function enablePush() {
    const client = await loadSupabase();
    if (!client || !userId) return;
    setPush("busy");
    const res = await subscribeToPush(client, userId);
    setPush(res.ok ? "hidden" : "error");
  }

  const bellLabel = unseen > 0 ? t("notifications.bellCount", { count: unseen }) : t("notifications.title");

  return (
    <div className={className} data-testid="notification-bell">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={bellLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] shadow transition hover:bg-[var(--panel-soft)] hover:text-[var(--heading)]"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unseen > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--on-accent)]"
            aria-hidden="true"
          >
            {badgeLabel(unseen)}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 -z-10 bg-black/40" onClick={close} data-testid="notification-backdrop" />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("notifications.title")}
            tabIndex={-1}
            className="absolute right-0 top-12 flex max-h-[min(34rem,calc(100dvh-5rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-left shadow-2xl outline-none"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t("notifications.title")}</h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("common.close")}
                className="rounded p-1 text-[var(--faint)] hover:text-[var(--muted)]"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
              {items.length === 0 && (
                <div className="px-2 py-6 text-center">
                  <p className="text-sm font-medium text-[var(--heading)]">{t("notifications.empty")}</p>
                  <p className="mt-1 text-xs text-[var(--faint)]">{t("notifications.emptyHint")}</p>
                </div>
              )}
              {respondError && <p className="text-xs text-[var(--danger)]">{t("home.respondError")}</p>}
              {items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  fresh={freshAtOpen.has(item.id)}
                  busy={item.kind === "invite" && busyId === item.game.game_id}
                  onNavigate={close}
                  onRespond={respond}
                  tPlural={tPlural}
                />
              ))}
              {push !== "hidden" && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--heading)]">{t("notifications.pushTitle")}</p>
                    {push === "error" && <p className="mt-0.5 text-[11px] text-[var(--danger)]">{t("notifications.pushError")}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={enablePush}
                    disabled={push === "busy"}
                    className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {push === "busy" ? t("notifications.pushBusy") : t("notifications.pushEnable")}
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] px-4 py-2.5">
              <Link href="/settings" onClick={close} className="text-xs font-medium text-[var(--accent)] hover:underline">
                {t("notifications.settings")}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  item,
  fresh,
  busy,
  onNavigate,
  onRespond,
  tPlural,
}: {
  item: NotificationItem;
  fresh: boolean;
  busy: boolean;
  onNavigate: () => void;
  onRespond: (gameId: string, accept: boolean) => void;
  tPlural: (key: string, count: number, vars?: Record<string, string | number>) => string;
}) {
  const { t } = useT();
  const dot = fresh ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" /> : <span className="w-2 shrink-0" aria-hidden="true" />;
  const card = "flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-2.5";

  if (item.kind === "turn") {
    const g = item.game;
    const clock = timerState(Date.now(), g.turn_started_at ? Date.parse(g.turn_started_at) : null, g.turn_limit_hours ?? 0);
    const left = clock.phase !== "off" && clock.phase !== "expired" ? formatRemaining(clock.remainingMs) : null;
    return (
      <Link href={`/multiplayer/play?g=${g.game_id}`} onClick={onNavigate} className={`${card} hover:bg-[var(--panel)]`}>
        {dot}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[var(--heading)]">{names(g) || t("home.multiplayerGame")}</span>
          <span className="block text-xs text-[var(--faint)]">
            {t("home.yourTurn")}
            {clock.phase !== "off" && (
              <span className={clock.phase === "expired" ? "text-[var(--danger)]" : clock.phase === "warn" ? "text-amber-500" : undefined}>
                {" · "}
                {left ? t("home.turnEndsIn", { time: t(`turnTimer.unit.${left.unit}`, { n: left.value }) }) : t("home.turnOverdue")}
              </span>
            )}
          </span>
        </span>
      </Link>
    );
  }
  if (item.kind === "invite") {
    const g = item.game;
    return (
      <div className={card}>
        {dot}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--heading)]">{t("home.invitedYou", { name: names(g) || t("home.someone") })}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onRespond(g.game_id, true)}
              disabled={busy}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {t("multiplayer.accept")}
            </button>
            <button
              type="button"
              onClick={() => onRespond(g.game_id, false)}
              disabled={busy}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel)] disabled:opacity-50"
            >
              {t("multiplayer.decline")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (item.kind === "friends") {
    return (
      <Link href="/friends" onClick={onNavigate} className={`${card} hover:bg-[var(--panel)]`}>
        {dot}
        <span className="text-sm font-medium text-[var(--heading)]">{tPlural("notifications.friends", item.count)}</span>
      </Link>
    );
  }
  if (item.kind === "shield") {
    return (
      <div className={card}>
        {dot}
        <span className="text-sm font-medium text-[var(--heading)]">🛡️ {t("streakShield.savedTitle")}</span>
      </div>
    );
  }
  return (
    <div className={card}>
      {dot}
      <span className="text-sm text-[var(--heading)]">
        🎯 {t("quests.toast.line", { quest: questLabel(item.quest.id, t), xp: item.quest.xp })}
      </span>
    </div>
  );
}
