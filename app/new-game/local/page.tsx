"use client";

// The solo / pass-and-play game setup form: player names and seats (human
// or AI + difficulty), round mode (all / short / custom), then it calls
// GameContext to deal and routes to /game. AI names/blurbs come from
// aiPersonas.ts. (The tutorial is no longer a round mode here — it's a
// button on the /new-game fork screen.)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../AuthContext";
import { BackLink } from "../../components/BackLink";
import { PageTip } from "../../components/PageTip";
import { useGame } from "../../GameContext";
import { AI_PERSONAS, AI_THEORETICAL_LEVEL } from "../../lib/aiPersonas";
import { contractNeedLabel } from "../../lib/contractDisplay";
import { useT } from "../../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../../lib/i18n/keys";
import { fetchOwnDisplayName } from "../../lib/leaderboardStore";
import { loadLocalSettings } from "../../lib/settingsStore";
import { supabase } from "../../lib/supabaseClient";
import { capitalize } from "../../lib/text";
import {
  clearFavoriteGameConfig,
  contractsFor,
  deleteCloudFavoriteGameConfig,
  describeFavoriteGameConfig,
  FavoriteGameConfig,
  loadFavoriteGameConfigWithCloud,
  playerConfigsFor,
  pushFavoriteGameConfig,
  saveFavoriteGameConfig,
} from "../../lib/favoriteGameConfig";
import { CONTRACTS, ContractRequirement, Difficulty } from "@/types";

const DIFFICULTIES: Difficulty[] = ["beginner", "easy", "medium", "hard", "expert"];
const MAX_PLAYERS = 8;

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Every persona a New Game could possibly hand you — one collapsible
 * section per difficulty (native <details>, same disclosure Home's "More"
 * and Settings' InfoDetails use) so the whole roster of 35 doesn't unroll
 * at once. Shows every persona in AI_PERSONAS regardless of what's
 * configured above: the point is previewing who you *might* face, since
 * pickAiPersonas reshuffles a fresh face into every game anyway.
 */
function AiBiosSection() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
        {t("newGameLocal.meetTheAI")}
      </h2>
      {DIFFICULTIES.map((difficulty) => (
        <details key={difficulty} className="group rounded-lg border border-[var(--border)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-[var(--muted)] [&::-webkit-details-marker]:hidden">
            <span>
              {capitalize(t(`common.difficulty.${difficulty}` as TranslationKey))}
              <span className="ml-2 text-xs text-[var(--faint)]">
                {t("newGameLocal.lv", { level: AI_THEORETICAL_LEVEL[difficulty] })}
              </span>
            </span>
            <ChevronIcon className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-2 border-t border-[var(--border)] p-3">
            {AI_PERSONAS[difficulty].map((p) => (
              <div key={p.name} className="flex items-start gap-3 rounded-lg bg-[var(--panel)] px-3 py-2">
                <span className="text-xl leading-none" aria-hidden="true">
                  {p.avatar}
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-[var(--heading)]">{p.name}</span>
                  <span className="text-xs text-[var(--muted)]">{t(p.blurbKey)}</span>
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

type RoundMode = "all" | "short" | "custom";

export default function NewLocalGamePage() {
  const router = useRouter();
  const { t, tPlural } = useT();
  const { configured, user } = useAuth();
  const { startNewGame } = useGame();
  const [humanCount, setHumanCount] = useState(1);
  const [humanNames, setHumanNames] = useState<string[]>([t("newGame.you")]);
  // On a hard page load, this component's first render can happen before
  // LocaleProvider's async dictionary import resolves — the initializer
  // above then captures the English fallback instead of the real locale's
  // translation. Once `t` settles to the right dictionary, swap seat 0's
  // name in place, but only while it still matches whatever default was
  // last resolved — a name the player actually typed themselves is never
  // touched.
  const defaultYouRef = useRef(humanNames[0]);
  useEffect(() => {
    const resolved = t("newGame.you");
    // Capture the previous default before overwriting the ref — setHumanNames's
    // functional updater runs later (deferred to React's commit), so if the
    // ref were mutated first, the updater would compare against its own new
    // value instead of the value it's meant to detect as still-untouched.
    const previousDefault = defaultYouRef.current;
    defaultYouRef.current = resolved;
    setHumanNames((prev) => (prev[0] === previousDefault ? [resolved, ...prev.slice(1)] : prev));
  }, [t]);
  const [aiDifficulties, setAiDifficulties] = useState<Difficulty[]>(["medium"]);
  const [defaultDifficulty, setDefaultDifficulty] = useState<Difficulty>("medium");
  const [roundMode, setRoundMode] = useState<RoundMode>("all");
  const [customRounds, setCustomRounds] = useState<Set<number>>(
    () => new Set(CONTRACTS.map((c) => c.round))
  );
  // Only meaningful once there's a second human at the table — see the note
  // and toggle rendered below the name inputs, both gated on humanCount >= 2.
  const [trackStatsOn, setTrackStatsOn] = useState(true);
  // The saved "my usual" lineup, if any (localStorage, per-device). `saved`
  // flips true briefly after the player taps "Save as my usual" for a bit of
  // confirmation without a toast system.
  const [favorite, setFavorite] = useState<FavoriteGameConfig | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  // The signed-in account's own chosen display name — once it's loaded,
  // seat 0 (you, in both solo and pass-and-play) is locked to it, the same
  // name everywhere else in the app shows you as. null while unresolved or
  // signed out/no name chosen yet, in which case seat 0 stays "You" and,
  // for a guest, still freely editable (see yourNameLocked below).
  const [accountDisplayName, setAccountDisplayName] = useState<string | null>(null);

  // Pick up the house-rule default from Settings once mounted (before the
  // player has had a chance to touch the AI difficulty picker themselves),
  // and the favorite lineup — local cache first, reconciled against the
  // cloud copy once signed in (see loadFavoriteGameConfigWithCloud's own
  // doc). Signed-in only: fetch the account's own display name too, so
  // seat 0 can be locked to it rather than a freely-typed "You".
  useEffect(() => {
    const preferred = loadLocalSettings().preferredAiDifficulty;
    setDefaultDifficulty(preferred);
    setAiDifficulties([preferred]);
    loadFavoriteGameConfigWithCloud(supabase, user?.id ?? null).then(setFavorite);
    if (supabase && user) {
      fetchOwnDisplayName(supabase, user.id)
        .then(setAccountDisplayName)
        .catch((err) => console.error("Failed to load your display name:", err));
    }
  }, [user]);

  // Signed in → seat 0 is locked to the account's own name (its only
  // editing surface is Account settings), falling back to "You" until a
  // name's actually been chosen. Not signed in → no account to lock to,
  // so seat 0 stays freely editable, same as every other pass-and-play seat.
  const yourNameLocked = !!(configured && user);
  const yourName = accountDisplayName?.trim() || t("newGame.you");
  useEffect(() => {
    if (yourNameLocked) setHumanNames((prev) => (prev[0] === yourName ? prev : [yourName, ...prev.slice(1)]));
  }, [yourNameLocked, yourName]);

  const totalPlayers = humanCount + aiDifficulties.length;
  const selectedContracts: ContractRequirement[] = contractsFor(roundMode, customRounds);
  const canStart = totalPlayers >= 2 && totalPlayers <= MAX_PLAYERS && selectedContracts.length > 0;

  // What "Your usual" actually shows and plays — the saved config with seat
  // 0's name overridden by the account's *current* display name, same as
  // handlePlayFavorite already deals under. Computed once and reused for
  // both, so the card can never show a stale name while dealing a fresh
  // one (or vice versa) — describing `favorite` directly here was exactly
  // that bug.
  const favoriteForDisplay: FavoriteGameConfig | null =
    favorite && yourNameLocked ? { ...favorite, humanNames: [yourName, ...favorite.humanNames.slice(1)] } : favorite;

  // The current form as a saveable config — also what "Save as my usual"
  // snapshots.
  const currentConfig: FavoriteGameConfig = {
    humanCount,
    humanNames,
    aiDifficulties,
    roundMode,
    customRounds: [...customRounds].sort((a, b) => a - b),
  };

  // Grows/shrinks the editable name list to match humanCount without
  // clobbering names already typed into the slots that stick around.
  function resizeHumanNames(count: number) {
    setHumanNames((prev) => {
      if (prev.length === count) return prev;
      if (prev.length < count) {
        const additions = Array.from({ length: count - prev.length }, (_, i) =>
          t("newGameLocal.playerPlaceholder", { n: prev.length + i + 1 })
        );
        return [...prev, ...additions];
      }
      return prev.slice(0, count);
    });
  }

  function setHumanCountAndResize(next: number) {
    setHumanCount(next);
    resizeHumanNames(next);
  }

  function setHumanName(index: number, name: string) {
    setHumanNames((prev) => prev.map((n, i) => (i === index ? name : n)));
  }

  function toggleCustomRound(round: number) {
    setCustomRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }

  function addAI() {
    if (totalPlayers >= MAX_PLAYERS) return;
    setAiDifficulties((prev) => [...prev, defaultDifficulty]);
  }

  function removeAI(index: number) {
    setAiDifficulties((prev) => prev.filter((_, i) => i !== index));
  }

  function setAIDifficulty(index: number, difficulty: Difficulty) {
    setAiDifficulties((prev) => prev.map((d, i) => (i === index ? difficulty : d)));
  }

  // A persona (name + avatar, e.g. "🦉 Hedda") per AI, picked fresh each
  // game — see pickAiPersonas' own doc for why this beats a plain
  // "Medium AI 1"/"Medium AI 2" label: with no live opponents, the AI is
  // the only "other player" this game has, and a face is worth more than
  // a difficulty count.
  function dealAndGo(cfg: FavoriteGameConfig, humansForCount: number, trackStats: boolean) {
    const configs = playerConfigsFor(cfg.humanNames.slice(0, cfg.humanCount), cfg.aiDifficulties);
    // The toggle only ever renders (and so can only ever have been touched)
    // once there are 2+ human players — below that, tracking always stays
    // on, regardless of whatever trackStatsOn happens to still hold from a
    // player count that was previously higher and has since been reduced.
    startNewGame(configs, contractsFor(cfg.roundMode, cfg.customRounds), humansForCount >= 2 ? trackStats : true);
    router.push("/game");
  }

  function handleStart() {
    if (!canStart) return;
    dealAndGo(currentConfig, humanCount, trackStatsOn);
  }

  function handlePlayFavorite() {
    if (!favoriteForDisplay) return;
    dealAndGo(favoriteForDisplay, favoriteForDisplay.humanCount, true);
  }

  function handleSaveFavorite() {
    if (!canStart) return;
    saveFavoriteGameConfig(currentConfig);
    setFavorite(currentConfig);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
    if (supabase && user) {
      pushFavoriteGameConfig(supabase, user.id, currentConfig).catch((err) =>
        console.error("Failed to sync your usual setup to the cloud:", err)
      );
    }
  }

  function handleForgetFavorite() {
    clearFavoriteGameConfig();
    setFavorite(null);
    if (supabase && user) {
      deleteCloudFavoriteGameConfig(supabase, user.id).catch((err) =>
        console.error("Failed to forget your usual setup in the cloud:", err)
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-10">
      <BackLink href="/new-game" label={t("newGame.title")} />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("newGame.soloAndPassAndPlay")}</h1>

      <PageTip id="new-game-local" title={t("newGameLocal.tip.title")}>
        {t("newGameLocal.tip.body")}
      </PageTip>

      {favoriteForDisplay && (
        <section className="flex flex-col gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--heading)]">{t("newGame.quickDeal")}</h2>
              <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                {describeFavoriteGameConfig(favoriteForDisplay, t, tPlural)}
              </p>
            </div>
            <button
              onClick={handlePlayFavorite}
              className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
            >
              {t("newGameLocal.play")}
            </button>
          </div>
          <button
            onClick={handleForgetFavorite}
            className="self-start text-xs text-[var(--faint)] underline hover:text-[var(--muted)]"
          >
            {t("newGameLocal.forgetSetup")}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          {t("newGameLocal.humanPlayers")}
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHumanCountAndResize(Math.max(1, humanCount - 1))}
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label={t("newGameLocal.fewerPlayers")}
          >
            −
          </button>
          <span className="w-6 text-center text-xl font-semibold">{humanCount}</span>
          <button
            onClick={() =>
              setHumanCountAndResize(Math.min(MAX_PLAYERS - aiDifficulties.length, humanCount + 1))
            }
            className="h-10 w-10 rounded-full bg-[var(--elevated)] text-lg font-bold text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
            aria-label={t("newGameLocal.morePlayers")}
          >
            +
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {humanNames.map((name, i) =>
            i === 0 && yourNameLocked ? (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-md bg-[var(--panel)] px-3 py-2 text-sm"
              >
                <span className="truncate text-[var(--text)]">{name}</span>
                <Link
                  href="/account"
                  className="shrink-0 text-xs text-[var(--faint)] underline hover:text-[var(--muted)]"
                >
                  {t("newGameLocal.changeInAccount")}
                </Link>
              </div>
            ) : (
              <input
                key={i}
                type="text"
                value={name}
                onChange={(e) => setHumanName(i, e.target.value)}
                placeholder={i === 0 ? t("newGame.you") : t("newGameLocal.playerPlaceholder", { n: i + 1 })}
                maxLength={20}
                className="rounded-md bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-1 ring-transparent focus:ring-[var(--accent)]"
              />
            )
          )}
        </div>
        <p className="text-xs text-[var(--faint)]">
          {yourNameLocked ? t("newGameLocal.namesNoteLocked") : t("newGameLocal.namesNoteUnlocked")}
        </p>

        {configured && user && humanCount >= 2 && (
          <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--heading)]">
            {tPlural("newGameLocal.statsNote", humanCount - 1, {
              name: humanNames[0]?.trim() || t("newGameLocal.theFirstPlayer"),
            })}
          </p>
        )}

        {configured && user && humanCount >= 2 && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--muted)]">{t("newGameLocal.trackStats")}</label>
            <div className="flex gap-2">
              {(
                [
                  [true, t("common.on")],
                  [false, t("common.off")],
                ] as [boolean, string][]
              ).map(([v, l]) => (
                <button
                  key={l}
                  onClick={() => setTrackStatsOn(v)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
                    trackStatsOn === v
                      ? "bg-[var(--accent)] text-[var(--on-accent)]"
                      : "bg-[var(--panel)] text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--faint)]">
              {t("newGameLocal.trackStatsNote", {
                name: humanNames[0]?.trim() || t("newGameLocal.theFirstPlayer"),
              })}
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("newGameLocal.aiOpponents")}
          </h2>
          <button
            onClick={addAI}
            disabled={totalPlayers >= MAX_PLAYERS}
            className="rounded-md bg-[var(--elevated)] px-3 py-1 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("newGameLocal.addAI")}
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {aiDifficulties.map((difficulty, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel)] px-3 py-2"
            >
              <span className="text-sm text-[var(--muted)]">{t("newGameLocal.aiN", { n: i + 1 })}</span>
              <select
                value={difficulty}
                onChange={(e) => setAIDifficulty(i, e.target.value as Difficulty)}
                className="rounded-md bg-[var(--panel-soft)] px-2 py-1 text-sm text-[var(--heading)]"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {capitalize(t(`common.difficulty.${d}` as TranslationKey))}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeAI(i)}
                className="text-sm text-[var(--danger)] hover:opacity-80"
                aria-label={t("newGameLocal.removeAiN", { n: i + 1 })}
              >
                {t("common.remove")}
              </button>
            </div>
          ))}
          {aiDifficulties.length === 0 && (
            <p className="text-sm text-[var(--faint)]">{t("newGameLocal.noAiOpponents")}</p>
          )}
        </div>
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
              className={`min-w-[calc(50%-0.25rem)] flex-1 rounded-md px-3 py-2 text-sm font-medium ${
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
          <p className="text-xs text-[var(--faint)]">
            {t("newGameLocal.shortNote", {
              first: contractNeedLabel(2, 1, tPlural),
              second: contractNeedLabel(1, 2, tPlural),
            })}
          </p>
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
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent)]"
                        : "border-[var(--border)] bg-transparent"
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                        <path
                          d="M3 8.5l3 3 7-7"
                          fill="none"
                          stroke="var(--on-accent)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
            {selectedContracts.length === 0 && (
              <p className="text-xs text-[var(--accent)]">{t("newGameLocal.pickAtLeastOneRound")}</p>
            )}
          </div>
        )}
      </section>

      {!canStart && (
        <p className="text-sm text-[var(--accent)]">
          {selectedContracts.length === 0
            ? t("newGameLocal.pickOneRoundToStart")
            : t("newGameLocal.needPlayers", { max: MAX_PLAYERS })}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("newGameLocal.startGame")}
        </button>
        <button
          onClick={handleSaveFavorite}
          disabled={!canStart}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-40"
        >
          {justSaved
            ? t("newGameLocal.savedCheck")
            : favorite
              ? t("newGameLocal.updateQuickDeal")
              : t("newGameLocal.saveAsQuickDeal")}
        </button>
      </div>

      <AiBiosSection />

      <Link href="/new-game" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.back")}
      </Link>
    </main>
  );
}
