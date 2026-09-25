"use client";

// All of How to Play's translated prose, split out of page.tsx so that
// file can stay a Server Component for its metadata export (same reason
// BackLink.tsx is split out — see its own comment).

import type { ReactNode } from "react";
import { contractNeedLabel } from "../lib/contractDisplay";
import { useT } from "../lib/i18n/LocaleProvider";
import { CONTRACTS } from "@/types";

function Note({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--heading)]">
      <strong className="font-semibold">{t("howToPlay.note")}</strong> {children}
    </p>
  );
}

export function HowToPlayContent() {
  const { t, tPlural } = useT();

  const PENALTY_ROWS = [
    { label: t("howToPlay.scoring.numberCards"), value: t("howToPlay.scoring.perCard", { points: 5 }) },
    { label: t("howToPlay.scoring.faceCards"), value: t("howToPlay.scoring.perCard", { points: 10 }) },
    { label: t("howToPlay.scoring.aces"), value: t("howToPlay.scoring.perCard", { points: 15 }) },
    { label: t("howToPlay.scoring.twos"), value: t("howToPlay.scoring.perCard", { points: 20 }) },
    { label: t("howToPlay.scoring.jokers"), value: t("howToPlay.scoring.perCard", { points: 50 }) },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("howToPlay.title")}</h1>

      <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--heading)]">
        {t("howToPlay.newHerePrefix")} <strong className="font-semibold">{t("home.newGame")}</strong>{" "}
        {t("howToPlay.newHereBody")} <strong className="font-semibold">{t("howToPlay.tutorial")}</strong>{" "}
        {t("howToPlay.newHereSuffix")}
      </p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.basicSetup.title")}</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>{t("howToPlay.basicSetup.players")}</li>
          <li>{t("howToPlay.basicSetup.deck")}</li>
          <li>{t("howToPlay.basicSetup.deal")}</li>
          <li>{t("howToPlay.basicSetup.piles")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.rounds.title")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("howToPlay.rounds.body")}</p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("howToPlay.rounds.round")}</th>
                <th className="px-3 py-2 font-medium">{t("howToPlay.rounds.contract")}</th>
                <th className="px-3 py-2 font-medium">{t("howToPlay.rounds.meldsNeeded")}</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.round} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{c.round}</td>
                  <td className="px-3 py-2 font-semibold text-[var(--heading)]">
                    {contractNeedLabel(c.books, c.runs, tPlural)}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">{contractNeedLabel(c.books, c.runs, tPlural)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--faint)]">{t("howToPlay.rounds.bookRunDef")}</p>
        <Note>
          {t("howToPlay.rounds.noteBody1")} <strong>{t("newGameLocal.short")}</strong>{" "}
          {t("howToPlay.rounds.noteBody2")} <strong>{t("newGameLocal.custom")}</strong>{" "}
          {t("howToPlay.rounds.noteBody3")}
        </Note>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.turn.title")}</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.turn.drawLabel")}</strong> —{" "}
            {t("howToPlay.turn.drawBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.turn.meldLabel")}</strong> —{" "}
            {t("howToPlay.turn.meldBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.turn.layOffLabel")}</strong> —{" "}
            {t("howToPlay.turn.layOffBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.turn.discardLabel")}</strong> —{" "}
            {t("howToPlay.turn.discardBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.turn.goingOutLabel")}</strong> —{" "}
            {t("howToPlay.turn.goingOutBody")}
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.choosingMeld.title")}</h2>
        <p>{t("howToPlay.choosingMeld.intro")}</p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>{t("howToPlay.choosingMeld.step1")}</li>
          <li>
            {t("howToPlay.choosingMeld.step2Prefix")}{" "}
            <strong className="text-[var(--heading)]">{t("game.buildMeld.groupSelected")}</strong>{" "}
            {t("howToPlay.choosingMeld.step2Suffix")}
          </li>
          <li>{t("howToPlay.choosingMeld.step3")}</li>
          <li>
            {t("howToPlay.choosingMeld.step4Prefix")}{" "}
            <strong className="text-[var(--heading)]">{t("howToPlay.confirmMeld")}</strong>{" "}
            {t("howToPlay.choosingMeld.step4Suffix")}
          </li>
        </ol>
        <p>{t("howToPlay.choosingMeld.outro")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.rules.title")}</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.bookLabel")}</strong>{" "}
            {t("howToPlay.rules.bookBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.runLabel")}</strong>{" "}
            {t("howToPlay.rules.runBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.aceLabel")}</strong> —{" "}
            {t("howToPlay.rules.aceBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.wildLabel")}</strong>{" "}
            {t("howToPlay.rules.wildBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.wildLimitLabel")}</strong>{" "}
            {t("howToPlay.rules.wildLimitBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.rules.noTwoWildsLabel")}</strong>{" "}
            {t("howToPlay.rules.noTwoWildsBody")}
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.outNoDiscard.title")}</h2>
        <p>
          {t("howToPlay.outNoDiscard.body1Prefix")}{" "}
          <strong className="text-[var(--heading)]">{t("howToPlay.outNoDiscard.anyRound")}</strong>
          {t("howToPlay.outNoDiscard.body1Suffix")}
        </p>
        <p>{t("howToPlay.outNoDiscard.body2")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.threeRuns.title")}</h2>
        <p>
          {t("howToPlay.threeRuns.body1Prefix")}{" "}
          <strong className="text-[var(--heading)]">{t("howToPlay.threeRuns.threeRunsLabel")}</strong>{" "}
          {t("howToPlay.threeRuns.body1Suffix")}
        </p>
        <p>{t("howToPlay.threeRuns.body2")}</p>
        <Note>{t("howToPlay.threeRuns.noteBody")}</Note>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.scoring.title")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("howToPlay.scoring.body")}</p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel)] text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">{t("howToPlay.scoring.card")}</th>
                <th className="px-3 py-2 font-medium">{t("howToPlay.scoring.penaltyPoints")}</th>
              </tr>
            </thead>
            <tbody>
              {PENALTY_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-[var(--heading)]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.organizing.title")}</h2>
        <p>
          {t("howToPlay.organizing.body1")}{" "}
          <strong className="text-[var(--heading)]">{t("hand.sortBySuit")}</strong> {t("common.or")}{" "}
          <strong className="text-[var(--heading)]">{t("hand.sortByRank")}</strong>{" "}
          {t("howToPlay.organizing.body2")}
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("home.settings")}</h2>
        <p>{t("howToPlay.settings.body1")}</p>
        <p>{t("howToPlay.settings.body2")}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">{t("howToPlay.different.title")}</h2>
        <p>{t("howToPlay.different.intro")}</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.different.buyLabel")}</strong> —{" "}
            {t("howToPlay.different.buyBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.different.playerLabel")}</strong> —{" "}
            {t("howToPlay.different.playerBody")}
          </li>
          <li>
            <strong className="text-[var(--heading)]">{t("howToPlay.different.jokerBookLabel")}</strong> —{" "}
            {t("howToPlay.different.jokerBookBody")}
          </li>
        </ul>
      </section>
    </>
  );
}
