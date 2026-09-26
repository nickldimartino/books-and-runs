"use client";

// A standalone pen-and-paper score sheet for people playing the physical
// card game, with no engine involved — just a persisted grid of players ×
// rounds with per-round totals. State lives in localStorage via
// scorecardStore.ts. It borrows CONTRACTS only for the round labels.

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTRACTS, ContractRequirement, SHORT_GAME_CONTRACTS } from "@/types";
import { BackLink, BottomBackLink } from "../components/BackLink";
import { PageTip } from "../components/PageTip";
import { contractNeedLabel } from "../lib/contractDisplay";
import { useT } from "../lib/i18n/LocaleProvider";
import type { Vars } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import {
  clearScorecard,
  loadScorecard,
  newPlayerId,
  RoundMode,
  saveScorecard,
  ScorecardPlayer,
} from "../lib/scorecardStore";

type T = (key: TranslationKey, vars?: Vars) => string;

function defaultPlayers(t: T): ScorecardPlayer[] {
  return [
    { id: newPlayerId(), name: t("newGameLocal.playerPlaceholder", { n: 1 }) },
    { id: newPlayerId(), name: t("newGameLocal.playerPlaceholder", { n: 2 }) },
  ];
}

export default function ScorecardPage() {
  const { t, tPlural } = useT();
  const [phase, setPhase] = useState<"setup" | "scoring">("setup");
  const [players, setPlayers] = useState<ScorecardPlayer[]>(() => defaultPlayers(t));
  const [roundMode, setRoundMode] = useState<RoundMode>("all");
  const [customRounds, setCustomRounds] = useState<Set<number>>(
    () => new Set(CONTRACTS.map((c) => c.round))
  );
  const [scores, setScores] = useState<Record<string, Record<number, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Restore an in-progress scorecard (e.g. the tab got backgrounded
  // mid-game-night) — this page has no database, so localStorage is the
  // only thing standing between a real scorecard and losing it.
  useEffect(() => {
    const saved = loadScorecard();
    if (saved) {
      setPhase(saved.phase);
      setPlayers(saved.players);
      setRoundMode(saved.roundMode);
      setCustomRounds(new Set(saved.customRounds));
      setScores(saved.scores);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveScorecard({
      phase,
      players,
      roundMode,
      customRounds: [...customRounds],
      scores,
    });
  }, [loaded, phase, players, roundMode, customRounds, scores]);

  const selectedContracts: ContractRequirement[] =
    roundMode === "all"
      ? CONTRACTS
      : roundMode === "short"
        ? SHORT_GAME_CONTRACTS
        : CONTRACTS.filter((c) => customRounds.has(c.round));
  const canStart = players.length >= 2 && selectedContracts.length > 0;

  function toggleCustomRound(round: number) {
    setCustomRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  }

  function addPlayer() {
    setPlayers((prev) => [
      ...prev,
      { id: newPlayerId(), name: t("newGameLocal.playerPlaceholder", { n: prev.length + 1 }) },
    ]);
  }

  function removePlayer(id: string) {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }

  function renamePlayer(id: string, name: string) {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function setScore(playerId: string, round: number, value: string) {
    setScores((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [round]: value },
    }));
  }

  function totalFor(playerId: string): number {
    return selectedContracts.reduce(
      (sum, c) => sum + (Number(scores[playerId]?.[c.round]) || 0),
      0
    );
  }

  function confirmNewScorecard() {
    clearScorecard();
    setPhase("setup");
    setPlayers(defaultPlayers(t));
    setRoundMode("all");
    setCustomRounds(new Set(CONTRACTS.map((c) => c.round)));
    setScores({});
    setConfirmingReset(false);
  }

  const totals = players.map((p) => totalFor(p.id));
  const minTotal = totals.length > 0 ? Math.min(...totals) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <BackLink href="/social" smart />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("scorecard.title")}</h1>

      <PageTip id="scorecard" title={t("scorecard.tip.title")}>
        {t("scorecard.tip.body")}
      </PageTip>

      {phase === "setup" ? (
        <>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("scorecard.players")}
              </h2>
              <button
                onClick={addPlayer}
                className="rounded-md bg-[var(--elevated)] px-3 py-1 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
              >
                {t("scorecard.addPlayer")}
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => renamePlayer(p.id, e.target.value)}
                    placeholder={t("newGameLocal.playerPlaceholder", { n: i + 1 })}
                    maxLength={20}
                    className="flex-1 rounded-md bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-1 ring-transparent focus:ring-[var(--accent)]"
                  />
                  <button
                    onClick={() => removePlayer(p.id)}
                    disabled={players.length <= 1}
                    aria-label={t("scorecard.removePlayer", {
                      name: p.name || t("newGameLocal.playerPlaceholder", { n: i + 1 }),
                    })}
                    className="text-sm text-[var(--danger)] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {t("common.remove")}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("scorecard.rounds")}
            </h2>
            <div className="flex gap-2">
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
                : t("scorecard.needTwoPlayers")}
            </p>
          )}

          <button
            onClick={() => setPhase("scoring")}
            disabled={!canStart}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("scorecard.start")}
          </button>
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--panel)] text-[var(--faint)]">
                  <th className="sticky left-0 bg-[var(--panel)] px-3 py-2 text-left font-medium">
                    {t("roundSummary.player")}
                  </th>
                  {selectedContracts.map((c) => (
                    <th key={c.round} className="min-w-[76px] px-2 py-2 text-center font-medium">
                      <div>{t("scorecard.roundAbbr", { round: c.round })}</div>
                      <div className="text-[10px] font-normal normal-case text-[var(--faint)]">
                        {contractNeedLabel(c.books, c.runs, tPlural)}
                      </div>
                    </th>
                  ))}
                  <th className="min-w-[70px] px-3 py-2 text-center font-semibold">
                    {t("roundSummary.total")}
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const total = totals[i];
                  const isLeader = minTotal !== null && total === minTotal;
                  return (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="sticky left-0 bg-[var(--bg)] px-3 py-2">
                        {/* Was static text here — a typo'd name, or a late
                            arrival who needs relabeling from "Player 3",
                            meant starting the whole scorecard over, wiping
                            every score already entered, since the only
                            other place a name could be edited was the setup
                            screen this table replaces. bg-transparent until
                            focused keeps the table looking like a table, not
                            a form, until someone actually taps in to rename. */}
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => renamePlayer(p.id, e.target.value)}
                          placeholder={t("newGameLocal.playerPlaceholder", { n: i + 1 })}
                          maxLength={20}
                          className="w-full min-w-[6rem] rounded-md bg-transparent px-1.5 py-1 text-sm font-medium text-[var(--heading)] outline-none ring-1 ring-transparent focus:bg-[var(--panel-soft)] focus:ring-[var(--accent)]"
                        />
                      </td>
                      {selectedContracts.map((c) => (
                        <td key={c.round} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={scores[p.id]?.[c.round] ?? ""}
                            onChange={(e) => setScore(p.id, c.round, e.target.value)}
                            placeholder="0"
                            className="w-14 rounded-md bg-[var(--panel)] px-2 py-1 text-center text-sm text-[var(--text)] outline-none ring-1 ring-transparent focus:ring-[var(--accent)]"
                          />
                        </td>
                      ))}
                      <td
                        className={`px-3 py-2 text-center font-semibold ${
                          isLeader ? "text-[var(--accent)]" : "text-[var(--heading)]"
                        }`}
                      >
                        {total}
                      </td>
                      <td className="px-1 text-center">
                        <button
                          onClick={() => removePlayer(p.id)}
                          disabled={players.length <= 1}
                          aria-label={t("scorecard.removePlayer", {
                            name: p.name || t("newGameLocal.playerPlaceholder", { n: i + 1 }),
                          })}
                          className="text-xs text-[var(--danger)] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-[var(--faint)]">{t("scorecard.lowestWinsNote")}</p>

          {confirmingReset ? (
            <div className="flex flex-col gap-3 rounded-lg border border-[var(--danger)]/50 bg-[var(--panel)] p-3">
              <p className="text-sm text-[var(--muted)]">{t("scorecard.confirmReset")}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="flex-1 rounded-lg border border-[var(--border)] min-h-11 px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={confirmNewScorecard}
                  className="flex-1 rounded-lg border border-[var(--danger)] min-h-11 px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-[var(--panel-soft)]"
                >
                  {t("scorecard.yesStartOver")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={addPlayer}
                className="flex-1 rounded-lg border border-[var(--border)] min-h-11 px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                {t("scorecard.addPlayer")}
              </button>
              <button
                onClick={() => setConfirmingReset(true)}
                className="flex-1 rounded-lg border border-[var(--border)] min-h-11 px-4 py-2.5 text-sm font-medium text-[var(--danger)] hover:bg-[var(--panel-soft)]"
              >
                {t("scorecard.newScorecard")}
              </button>
            </div>
          )}
        </>
      )}

      <BottomBackLink fallback="/social" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]" />
    </main>
  );
}
