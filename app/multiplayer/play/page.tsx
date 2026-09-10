"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../AuthContext";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { OpponentStrip } from "../../components/OpponentStrip";
import { DiscardPile, DrawPile } from "../../components/Piles";
import { PlayingCard } from "../../components/PlayingCard";
import { AchievementUnlockCard } from "../../components/AchievementUnlock";
import { useMpGame } from "../../lib/useMpGame";
import { layOffOptions } from "@/meld";
import type { Card, Meld, Player } from "@/types";
import type { RedactedView } from "@/mp/types";

function useGameId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("g"));
  }, []);
  return id;
}

// OpponentStrip wants Player[] with a `.hand` array; a redacted view only has
// counts, so pad the hand to the right length.
function stripPlayers(view: RedactedView): Player[] {
  return view.players.map((p) => ({
    id: `seat-${p.seat}`,
    name: p.name,
    isAI: p.isAI,
    hand: new Array(p.handCount).fill(null) as unknown as Card[],
    hasMeldedContract: p.hasMeldedContract,
    cumulativeScore: p.cumulativeScore,
  }));
}

const RANK_SUIT: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
  joker: "★",
};
const label = (c: Card) => `${c.rank === "JOKER" ? "Jkr" : c.rank}${c.suit === "joker" ? "" : RANK_SUIT[c.suit]}`;

export default function MultiplayerPlayPage() {
  const gameId = useGameId();
  const { loading: authLoading, user } = useAuth();
  const g = useMpGame(user ? gameId : null);
  const { view } = g;

  const [layoffArmed, setLayoffArmed] = useState(false);
  const [roundSummaryFor, setRoundSummaryFor] = useState<number | null>(null);

  const scores = useMemo(
    () => (view ? [...view.players].sort((a, b) => a.cumulativeScore - b.cumulativeScore) : []),
    [view]
  );

  // reset the armed-layoff mode whenever the turn context changes
  useEffect(() => {
    setLayoffArmed(false);
  }, [view?.currentSeat, view?.round, view?.youHaveDrawn]);

  // Surface the "Round N results" beat when the server has advanced the round
  // since we last looked. seenRoundsRef starts at the count we mounted with so
  // an already-in-progress game doesn't flash an old round's summary.
  const seenRoundsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!view) return;
    const count = view.roundResults.length;
    if (seenRoundsRef.current === null) {
      seenRoundsRef.current = count;
      return;
    }
    if (count > seenRoundsRef.current && !view.gameOver) {
      setRoundSummaryFor(view.roundResults[count - 1].round);
    }
    seenRoundsRef.current = count;
  }, [view]);


  if (!authLoading && !user) {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">Sign in to play</h1>
        <Link href="/sign-in" className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow">
          Sign in
        </Link>
      </Center>
    );
  }

  if (!gameId || authLoading || g.status === "loading") return <Center><LoadingSpinner /></Center>;

  if (g.status === "error") {
    return (
      <Center>
        <p className="text-sm text-[var(--danger)]">{g.error ?? "Couldn't load this game."}</p>
        <BackLink />
      </Center>
    );
  }

  if (g.status === "cancelled") {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">Game cancelled</h1>
        <p className="text-sm text-[var(--muted)]">Someone declined the invite before it started.</p>
        <BackLink />
      </Center>
    );
  }

  if (g.status === "pending" || g.status === "dealing") {
    return (
      <Center>
        <h1 className="text-xl font-bold text-[var(--heading)]">
          {g.status === "dealing" ? "Dealing…" : "Waiting for players"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {g.status === "dealing"
            ? "The game is being set up — this page will update."
            : "The game starts once everyone you invited accepts."}
        </p>
        <button
          onClick={g.refresh}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Refresh
        </button>
        <BackLink />
      </Center>
    );
  }

  if (!view) return <Center><LoadingSpinner /></Center>;

  const me = view.players.find((p) => p.userId === user?.id) ?? null;
  const currentName = view.players.find((p) => p.seat === view.currentSeat)?.name ?? "someone";

  if (view.gameOver) {
    const iWon = view.winnerSeat != null && view.players[view.winnerSeat]?.userId === user?.id;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
        <BackLink />
        <h1 className="text-2xl font-bold text-[var(--heading)]">
          {iWon ? "You won!" : `${view.winnerSeat != null ? view.players[view.winnerSeat].name : "Nobody"} won`}
        </h1>
        <ol className="flex flex-col gap-2">
          {scores.map((p, i) => (
            <li key={p.seat} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-4 py-3">
              <span className="text-sm font-medium text-[var(--heading)]">
                {i + 1}. {p.name}
                {p.resigned && <span className="ml-2 text-xs text-[var(--faint)]">(left)</span>}
              </span>
              <span className="text-sm font-semibold text-[var(--muted)]">{p.cumulativeScore}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-[var(--faint)]">
          Recorded to your stats and multiplayer record.
        </p>

        {g.unlockedAchievements.length > 0 && (
          <AchievementUnlockCard
            items={g.unlockedAchievements}
            heading={g.unlockedAchievements.length === 1 ? "Achievement unlocked" : "Achievements unlocked"}
          />
        )}
      </main>
    );
  }

  const isMyTurn = g.myTurn;
  const drawn = g.youHaveDrawn;
  const acting = isMyTurn && drawn;
  const alreadyMelded = !!me?.hasMeldedContract;
  const canLayOff = alreadyMelded || g.draft.groups.length > 0;

  const stagedBooks = g.draft.groups.filter((x) => x.type === "book").length;
  const stagedRuns = g.draft.groups.filter((x) => x.type === "run").length;
  const contractStaged =
    !alreadyMelded && g.draft.groups.length > 0 && stagedBooks === view.contract.books && stagedRuns === view.contract.runs;
  const goingOut = g.visibleHand.length === 0 && (alreadyMelded || contractStaged);
  const canEndTurn = acting && (goingOut || !!g.draft.discardCardId) && !g.busy;
  const oneSelected = g.selectedIds.length === 1;

  const selectedCard = oneSelected ? view.yourHand.find((c) => c.id === g.selectedIds[0]) ?? null : null;
  const layoffTargets = selectedCard
    ? view.melds.filter((m) => layOffOptions(selectedCard, m).length > 0).map((m) => m.id)
    : [];

  function onMeldClick(meld: Meld) {
    if (!layoffArmed || !selectedCard) return;
    const opts = layOffOptions(selectedCard, meld);
    if (opts.length === 0) return;
    g.stageLayoff(selectedCard.id, meld.id, opts.length === 1 ? opts[0] : "low");
    g.clearSelection();
    setLayoffArmed(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <BackLink />
        <button
          onClick={() => {
            if (confirm("Leave this game? You forfeit it.")) g.resign();
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Leave
        </button>
      </div>

      <header className="rounded-xl bg-[var(--panel)] px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
          Round {view.round} of {view.totalRounds}
        </p>
        <p className="text-lg font-bold leading-tight text-[var(--heading)]">{view.roundLabel}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--muted)]">
          {scores.map((p) => (
            <li key={p.seat}>
              {p.name}: <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore}</span>
            </li>
          ))}
        </ul>
      </header>

      <OpponentStrip
        players={stripPlayers(view)}
        currentPlayerIndex={view.currentSeat}
        discardHistory={view.discardHistory}
        pickupHistory={view.pickupHistory}
        aiStatus={null}
        aiThinking={false}
      />

      {g.error && <p className="text-sm text-[var(--danger)]">{g.error}</p>}

      {roundSummaryFor != null &&
        (() => {
          const rr = view.roundResults.find((r) => r.round === roundSummaryFor);
          if (!rr) return null;
          const ranked = [...rr.scores].sort((a, b) => a.penalty - b.penalty);
          return (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--heading)]">
                  Round {rr.round} · {rr.label}
                </h2>
                <button
                  onClick={() => setRoundSummaryFor(null)}
                  className="rounded p-0.5 text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {ranked.map((s) => (
                  <li key={s.seat} className="flex items-center justify-between">
                    <span className="text-[var(--muted)]">
                      {view.players.find((p) => p.seat === s.seat)?.name ?? `Seat ${s.seat}`}
                    </span>
                    <span className="text-[var(--heading)]">
                      +{s.penalty} <span className="text-[var(--faint)]">({s.cumulative})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--faint)]">
                Round {rr.round + 1} is underway — take your turn below when it&apos;s yours.
              </p>
            </section>
          );
        })()}

      {!isMyTurn ? (
        <p className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-center text-sm text-[var(--muted)]">
          Waiting for <strong className="text-[var(--heading)]">{currentName}</strong> to take their turn.
        </p>
      ) : !drawn ? (
        <p className="rounded-lg bg-[var(--accent)]/10 px-4 py-3 text-center text-sm font-medium text-[var(--accent)]">
          Your turn — draw a card to start.
        </p>
      ) : null}

      <section className="flex items-start justify-center gap-8">
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={!isMyTurn || drawn || g.busy}
            onClick={() => g.draw("stock")}
            className="disabled:opacity-50"
            aria-label="Draw from the pile"
          >
            <DrawPile count={view.drawPileCount} />
          </button>
          <span className="text-xs text-[var(--faint)]">Draw ({view.drawPileCount})</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={!isMyTurn || drawn || g.busy || !view.discardTop}
            onClick={() => g.draw("discard")}
            className="disabled:opacity-50"
            aria-label="Take the top of the discard pile"
          >
            <DiscardPile cards={view.discardPile} />
          </button>
          <span className="text-xs text-[var(--faint)]">Discard pile</span>
        </div>
      </section>

      <section className="rounded-xl bg-[var(--panel-soft)] p-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Table melds</h2>
        {view.melds.length === 0 ? (
          <p className="text-sm text-[var(--faint)]">Nothing melded yet this round.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {view.melds.map((meld) => {
              const armed = layoffArmed && layoffTargets.includes(meld.id);
              return (
                <button
                  key={meld.id}
                  onClick={() => onMeldClick(meld)}
                  disabled={!armed}
                  className={`rounded-lg p-1 text-left transition ${armed ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : ""}`}
                >
                  <span className="mb-1 block text-[10px] text-[var(--faint)]">
                    {view.players[Number(meld.ownerId.replace("seat-", ""))]?.name ?? meld.ownerId}
                  </span>
                  <span className="flex items-end gap-1">
                    {meld.cards.map((c) => (
                      <PlayingCard key={c.id} card={c} small />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {acting && (
        <section className="flex flex-col gap-3 rounded-xl bg-[var(--panel-soft)] p-4">
          {/* staged summary */}
          <div className="flex flex-wrap gap-2 text-xs">
            {!alreadyMelded && (
              <span className={contractStaged ? "text-[var(--accent)]" : "text-[var(--faint)]"}>
                Contract: {stagedBooks}/{view.contract.books} books · {stagedRuns}/{view.contract.runs} runs
                {contractStaged ? " ✓" : ""}
              </span>
            )}
            {g.draft.layoffs.length > 0 && (
              <span className="text-[var(--muted)]">· {g.draft.layoffs.length} lay-off{g.draft.layoffs.length > 1 ? "s" : ""}</span>
            )}
            {g.draft.discardCardId && (
              <span className="text-[var(--muted)]">
                · discard {label(view.yourHand.find((c) => c.id === g.draft.discardCardId)!)}
              </span>
            )}
          </div>

          {g.draft.groups.length > 0 && (
            <ul className="flex flex-col gap-2">
              {g.draft.groups.map((grp) => (
                <li key={grp.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--panel)] px-3 py-2">
                  <span className="flex items-end gap-1">
                    {grp.cardIds
                      .map((id) => view.yourHand.find((c) => c.id === id))
                      .filter((c): c is Card => !!c)
                      .map((c) => <PlayingCard key={c.id} card={c} small />)}
                  </span>
                  <button onClick={() => g.unstageGroup(grp.id)} className="shrink-0 text-xs text-[var(--danger)]">
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          )}
          {g.draft.layoffs.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {g.draft.layoffs.map((lo) => {
                const c = view.yourHand.find((x) => x.id === lo.cardId);
                return (
                  <li key={lo.cardId}>
                    <button
                      onClick={() => g.unstageLayoff(lo.cardId)}
                      className="rounded-md border border-[var(--accent)]/50 px-2 py-1 text-xs text-[var(--accent)]"
                    >
                      {c ? label(c) : "card"} ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {g.groupError && <p className="text-xs text-[var(--danger)]">{g.groupError}</p>}

          <div className="flex flex-wrap gap-2">
            {!alreadyMelded && (
              <button
                onClick={() => g.stageGroup()}
                disabled={g.selectedIds.length === 0}
                className="rounded-md bg-[var(--elevated)] px-3 py-1.5 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:opacity-40"
              >
                Group selected
              </button>
            )}
            {canLayOff && (
              <button
                onClick={() => setLayoffArmed((v) => !v)}
                disabled={!oneSelected || layoffTargets.length === 0}
                className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${
                  layoffArmed ? "bg-[var(--accent)] text-[var(--on-accent)]" : "bg-[var(--elevated)] text-[var(--heading)] hover:bg-[var(--elevated-hover)]"
                }`}
              >
                {layoffArmed ? "Tap a meld above…" : "Lay off selected"}
              </button>
            )}
            {!goingOut && (
              <button
                onClick={() => oneSelected && g.setDiscard(g.selectedIds[0])}
                disabled={!oneSelected}
                className="rounded-md bg-[var(--elevated)] px-3 py-1.5 text-sm font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:opacity-40"
              >
                Set as discard
              </button>
            )}
          </div>

          <button
            onClick={g.commitTurn}
            disabled={!canEndTurn}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow disabled:opacity-40"
          >
            {g.busy ? "…" : goingOut ? "Go out" : "End turn"}
          </button>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
          Your hand ({g.visibleHand.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {g.visibleHand.map((card) => {
            const eligible = canLayOff && view.melds.some((m) => layOffOptions(card, m).length > 0);
            return (
              <PlayingCard
                key={card.id}
                card={card}
                selected={g.selectedIds.includes(card.id)}
                canLayOff={eligible}
                onClick={acting ? () => g.toggleCard(card.id) : undefined}
              />
            );
          })}
          {g.visibleHand.length === 0 && (
            <p className="text-sm text-[var(--faint)]">Your hand is empty — end your turn to go out.</p>
          )}
        </div>
        {acting && (
          <p className="mt-2 text-xs text-[var(--faint)]">
            Tap cards to select. {alreadyMelded ? "" : "“Group selected” lays a book or run toward the contract. "}
            Pick one card and “Set as discard” to end your turn.
          </p>
        )}
      </section>
    </main>
  );
}

function Center({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
    >
      ← Home
    </Link>
  );
}
