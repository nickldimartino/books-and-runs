"use client";

// Multiplayer game setup. Pick friends to invite (from friendsStore) and
// optional AI seats, choose the round set, then createMpGame() hands it to
// the Edge Function and routes Home — the game stays "pending" until every
// invitee accepts (from the Home "Your games" list), at which point the
// server deals. Signed-in + Supabase-configured only.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { track } from "../../lib/analytics";
import { BackLink } from "../../components/BackLink";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { PageTip } from "../../components/PageTip";
import { pickAiPersonas } from "../../lib/aiPersonas";
import { contractNeedLabel } from "../../lib/contractDisplay";
import { Friend, getFriends } from "../../lib/friendsStore";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../../lib/i18n/keys";
import { displayNameFor } from "../../lib/leaderboardStore";
import { createMpGame, MpError, NewGameSeat } from "../../lib/mpStore";
import { supabase } from "../../lib/supabaseClient";
import { capitalize } from "../../lib/text";
import { DEFAULT_TURN_LIMIT_HOURS, TURN_LIMIT_OPTIONS, TurnLimitHours } from "@/mp/turnTimer";
import { CONTRACTS, Difficulty, SHORT_GAME_CONTRACTS } from "@/types";
import { translateError } from "../../lib/i18n/serverErrors";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const MAX_PLAYERS = 8;

type RoundMode = "all" | "short" | "custom";

export default function NewMultiplayerGamePage() {
  const router = useRouter();
  const { t, tPlural } = useT();
  const { configured, loading: authLoading, user } = useAuth();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ais, setAis] = useState<Difficulty[]>([]);
  const [roundMode, setRoundMode] = useState<RoundMode>("all");
  const [customRounds, setCustomRounds] = useState<Set<number>>(() => new Set(CONTRACTS.map((c) => c.round)));
  const [turnLimit, setTurnLimit] = useState<TurnLimitHours>(DEFAULT_TURN_LIMIT_HOURS);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setFriends(await getFriends(supabase));
    } catch (err) {
      console.error("Failed to load friends:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    load();
  }, [user, load]);

  const rounds =
    roundMode === "all"
      ? CONTRACTS.map((c) => c.round)
      : roundMode === "short"
        ? SHORT_GAME_CONTRACTS.map((c) => c.round)
        : CONTRACTS.filter((c) => customRounds.has(c.round)).map((c) => c.round);

  const total = 1 + picked.size + ais.length;
  const canCreate = picked.size >= 1 && total >= 2 && total <= MAX_PLAYERS && rounds.length > 0 && !creating;

  function togglePicked(userId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else if (1 + next.size + ais.length < MAX_PLAYERS) next.add(userId);
      return next;
    });
  }

  function toggleCustomRound(round: number) {
    setCustomRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }

  async function handleCreate() {
    if (!supabase || !canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const personas = ais.length > 0 ? pickAiPersonas(ais) : [];
      const seats: NewGameSeat[] = [
        ...[...picked].map((userId) => ({ kind: "human" as const, user_id: userId })),
        ...ais.map((difficulty, i) => ({
          kind: "ai" as const,
          difficulty,
          name: personas[i].displayName,
        })),
      ];
      await createMpGame(supabase, { contractRounds: rounds, seats, turnLimitHours: turnLimit });
      track("mp_game_created", {
        players: 1 + picked.size + ais.length,
        humans: 1 + picked.size,
        ais: ais.length,
        rounds: rounds.length,
        turn_limit_hours: turnLimit,
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof MpError ? translateError(err.message, t) : t("newGameMultiplayer.createError"));
      setCreating(false);
    }
  }

  if (!authLoading && (!configured || !user)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("newGameMultiplayer.signInToPlay")}</h1>
        <Link href="/sign-in" className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
          {t("signIn.title")}
        </Link>
        <Link
          href="/new-game"
          className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("newGameMultiplayer.backToNewGame")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-7 px-6 py-10">
      <BackLink href="/new-game" label={t("newGame.title")} />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("newGameMultiplayer.title")}</h1>

      <PageTip id="new-game-multiplayer" title={t("newGameMultiplayer.tip.title")}>
        {t("newGameMultiplayer.tip.body")}
      </PageTip>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("newGameMultiplayer.inviteFriends")}
            </h2>
            {friends.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--faint)]">
                {t("newGameMultiplayer.noFriendsYet")}{" "}
                <Link href="/friends" className="underline">
                  {t("home.progressTile.friends")}
                </Link>{" "}
                {t("newGameMultiplayer.pageThenComeBack")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {friends.map((f) => {
                  const checked = picked.has(f.userId);
                  return (
                    <li key={f.userId}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => togglePicked(f.userId)}
                        className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left text-sm"
                      >
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                            checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                          }`}
                        >
                          {checked && (
                            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                              <path d="M3 8.5l3 3 7-7" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="font-medium text-[var(--heading)]">
                          {displayNameFor({ user_id: f.userId, display_name: f.displayName })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("newGameLocal.aiOpponents")}
              </h2>
              <button
                onClick={() => total < MAX_PLAYERS && setAis((prev) => [...prev, "medium"])}
                disabled={total >= MAX_PLAYERS}
                className="rounded-md bg-[var(--elevated)] px-3 py-1 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:opacity-40"
              >
                {t("newGameLocal.addAI")}
              </button>
            </div>
            {ais.length === 0 ? (
              <p className="text-sm text-[var(--faint)]">{t("newGameMultiplayer.aiOptional")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ais.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel)] px-3 py-2">
                    <span className="text-sm text-[var(--muted)]">{t("newGameLocal.aiN", { n: i + 1 })}</span>
                    <select
                      value={d}
                      onChange={(e) =>
                        setAis((prev) => prev.map((x, j) => (j === i ? (e.target.value as Difficulty) : x)))
                      }
                      className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-sm text-[var(--heading)]"
                    >
                      {DIFFICULTIES.map((x) => (
                        <option key={x} value={x}>
                          {capitalize(t(`common.difficulty.${x}` as TranslationKey))}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setAis((prev) => prev.filter((_, j) => j !== i))}
                      className="text-sm text-[var(--danger)] hover:opacity-80"
                    >
                      {t("common.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("newGameLocal.rounds")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", t("newGameLocal.all7")],
                  ["short", t("newGameLocal.short")],
                  ["custom", t("newGameLocal.custom")],
                ] as [RoundMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setRoundMode(mode)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                    roundMode === mode
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {roundMode === "short" && (
              <p className="text-xs text-[var(--faint)]">{t("newGameMultiplayer.shortNote")}</p>
            )}
            {roundMode === "custom" && (
              <div className="flex flex-col gap-2">
                {CONTRACTS.map((c) => {
                  const checked = customRounds.has(c.round);
                  return (
                    <button
                      key={c.round}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleCustomRound(c.round)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-md bg-[var(--panel)] px-3 py-3 text-left text-sm text-[var(--muted)]"
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          checked ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"
                        }`}
                      >
                        {checked && (
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                            <path d="M3 8.5l3 3 7-7" fill="none" stroke="var(--on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      {t("newGameLocal.roundLabel", {
                        round: c.round,
                        label: contractNeedLabel(c.books, c.runs, tPlural),
                      })}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("newGameMultiplayer.turnLimit.heading")}
            </h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("newGameMultiplayer.turnLimit.heading")}>
              {TURN_LIMIT_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={turnLimit === h}
                  onClick={() => setTurnLimit(h)}
                  className={`min-w-[4.5rem] flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                    turnLimit === h
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {h === 0 ? t("newGameMultiplayer.turnLimit.off") : t("newGameMultiplayer.turnLimit.hours", { hours: h })}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--faint)]">
              {turnLimit === 0
                ? t("newGameMultiplayer.turnLimit.offNote")
                : t("newGameMultiplayer.turnLimit.note", { hours: turnLimit })}
            </p>
          </section>

          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="mt-auto rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {creating ? t("newGameMultiplayer.creating") : t("newGameMultiplayer.sendInvites")}
          </button>
        </>
      )}
    </main>
  );
}
