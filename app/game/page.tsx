"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "../GameContext";
import { PlayingCard } from "../components/PlayingCard";
import { DraggableHand } from "../components/DraggableHand";
import { PassGate } from "../components/PassGate";
import { RoundSummary } from "../components/RoundSummary";
import { GameOverScreen } from "../components/GameOverScreen";
import { canLayOff, validateManualGroup } from "@/meld";
import { Card, Meld } from "@/types";

interface PendingGroup {
  id: string;
  type: "book" | "run";
  cardIds: string[];
}

function meldLabel(meld: Meld): string {
  return meld.type === "book" ? "Book" : "Run";
}

function contractNeedLabel(books: number, runs: number): string {
  const parts: string[] = [];
  if (books > 0) parts.push(`${books} book${books > 1 ? "s" : ""}`);
  if (runs > 0) parts.push(`${runs} run${runs > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

export default function GamePage() {
  const router = useRouter();
  const {
    state,
    hasDrawn,
    awaitingReveal,
    aiThinking,
    roundStartScores,
    lastDrawnCardId,
    revealHand,
    draw,
    confirmMeld,
    layOff,
    discard,
    sortHand,
    reorderHand,
    advanceRound,
  } = useGame();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  useEffect(() => {
    setSelectedCardIds([]);
    setPendingGroups([]);
    setGroupError(null);
  }, [state?.currentPlayerIndex, state?.round]);

  if (!state) return null;

  if (state.gameOver) return <GameOverScreen state={state} />;
  if (state.roundOver) {
    return (
      <RoundSummary state={state} roundStartScores={roundStartScores} onNextRound={advanceRound} />
    );
  }

  const player = state.players[state.currentPlayerIndex];

  if (!player.isAI && awaitingReveal) {
    return <PassGate name={player.name} onReveal={revealHand} />;
  }

  const contract = state.selectedContracts[state.round - 1];
  const discardTop = state.discardPile[state.discardPile.length - 1];
  const selectedCard = player.hand.find((c) => c.id === selectedCardIds[0]) ?? null;

  const stagedCardIds = new Set(pendingGroups.flatMap((g) => g.cardIds));
  const visibleHand = player.hand.filter((c) => !stagedCardIds.has(c.id));
  const stagedBooks = pendingGroups.filter((g) => g.type === "book").length;
  const stagedRuns = pendingGroups.filter((g) => g.type === "run").length;
  const meldReady = stagedBooks === contract.books && stagedRuns === contract.runs;

  const meldsByOwner = new Map<string, Meld[]>();
  for (const meld of state.melds) {
    const list = meldsByOwner.get(meld.ownerId) ?? [];
    list.push(meld);
    meldsByOwner.set(meld.ownerId, list);
  }

  function handleCardClick(card: Card) {
    setGroupError(null);
    if (player.hasMeldedContract) {
      // Post-meld: single-select, for laying off or discarding one card.
      setSelectedCardIds((prev) => (prev[0] === card.id ? [] : [card.id]));
    } else {
      // Pre-meld: multi-select, for building a book/run to stage.
      setSelectedCardIds((prev) =>
        prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]
      );
    }
  }

  function handleMeldClick(meld: Meld) {
    if (!selectedCard || !player.hasMeldedContract) return;
    if (!canLayOff(selectedCard, meld)) return;
    layOff(selectedCard.id, meld.id);
    setSelectedCardIds([]);
  }

  function handleDiscardSelected() {
    if (selectedCardIds.length !== 1) return;
    discard(selectedCardIds[0]);
    setSelectedCardIds([]);
  }

  function handleGroupSelected() {
    if (selectedCardIds.length === 0) return;
    const cards = selectedCardIds
      .map((id) => player.hand.find((c) => c.id === id))
      .filter((c): c is Card => !!c);
    const result = validateManualGroup(cards, contract);
    if (!result.valid || !result.type) {
      setGroupError(result.reason ?? "Not a valid book or run.");
      return;
    }
    setPendingGroups((prev) => [
      ...prev,
      { id: `group-${Date.now()}-${prev.length}`, type: result.type!, cardIds: selectedCardIds },
    ]);
    setSelectedCardIds([]);
    setGroupError(null);
  }

  function removePendingGroup(id: string) {
    setPendingGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function handleConfirmMeld() {
    const success = confirmMeld(pendingGroups.map((g) => g.cardIds));
    if (success) {
      setPendingGroups([]);
      setSelectedCardIds([]);
      setGroupError(null);
    } else {
      setGroupError("Couldn't meld those groups — check they still match this round's contract.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/")}
          className="rounded-lg border border-emerald-100/20 px-3 py-1.5 text-xs font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          ← Home
        </button>
        <Link
          href="/how-to-play"
          className="rounded-lg border border-emerald-100/20 px-3 py-1.5 text-xs font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          How to play
        </Link>
      </div>

      <header className="flex items-center justify-between rounded-xl bg-emerald-900/60 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-100/60">
            Round {state.round} of {state.selectedContracts.length}
          </p>
          <p className="text-lg font-bold text-amber-100">{contract.label}</p>
        </div>
        <ul className="text-right text-xs text-emerald-100/70">
          {[...state.players]
            .sort((a, b) => a.cumulativeScore - b.cumulativeScore)
            .map((p) => (
              <li key={p.id}>
                {p.name}: <span className="font-semibold text-amber-100">{p.cumulativeScore}</span>
              </li>
            ))}
        </ul>
      </header>

      {player.isAI ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-semibold text-amber-100">{player.name} is playing…</p>
          {aiThinking && <p className="text-sm text-emerald-100/60">thinking…</p>}
        </div>
      ) : (
        <>
          <section className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => draw(false)}
                disabled={hasDrawn}
                className="disabled:opacity-50"
                aria-label="Draw from pile"
              >
                <PlayingCard card={{ id: "back", suit: "joker", rank: "JOKER", isWild: true }} faceDown />
              </button>
              <span className="text-xs text-emerald-100/60">Draw ({state.drawPile.length})</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => draw(true)}
                disabled={hasDrawn || !discardTop}
                className="disabled:opacity-50"
                aria-label="Draw from discard"
              >
                {discardTop ? (
                  <PlayingCard card={discardTop} />
                ) : (
                  <div className="h-20 w-14 rounded-lg border-2 border-dashed border-emerald-100/20" />
                )}
              </button>
              <span className="text-xs text-emerald-100/60">Discard pile</span>
            </div>
          </section>

          <section className="flex-1 rounded-xl bg-emerald-950/40 p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
              Table melds
            </h2>
            {state.melds.length === 0 ? (
              <p className="text-sm text-emerald-100/40">No melds on the table yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {[...meldsByOwner.entries()].map(([ownerId, melds]) => {
                  const owner = state.players.find((p) => p.id === ownerId);
                  return (
                    <div key={ownerId}>
                      <p className="mb-1 text-xs text-emerald-100/50">{owner?.name ?? ownerId}</p>
                      <div className="flex flex-wrap gap-3">
                        {melds.map((meld) => {
                          const isValidTarget = !!selectedCard && player.hasMeldedContract && canLayOff(selectedCard, meld);
                          return (
                            <button
                              key={meld.id}
                              onClick={() => handleMeldClick(meld)}
                              disabled={!isValidTarget}
                              className={`flex items-end gap-1 rounded-lg p-1 transition ${
                                isValidTarget ? "bg-amber-400/20 ring-2 ring-amber-400" : ""
                              }`}
                              title={meldLabel(meld)}
                            >
                              {meld.cards.map((c) => (
                                <PlayingCard key={c.id} card={c} small />
                              ))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {!player.hasMeldedContract && (
            <section className="flex flex-col gap-3 rounded-xl bg-emerald-950/40 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
                Build your meld — this round needs {contractNeedLabel(contract.books, contract.runs)}
              </h2>

              {pendingGroups.length > 0 && (
                <div className="flex flex-col gap-2">
                  {pendingGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-emerald-900/60 p-2"
                    >
                      <span className="w-12 shrink-0 text-xs font-semibold capitalize text-amber-300">
                        {group.type}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {group.cardIds.map((id) => {
                          const card = player.hand.find((c) => c.id === id);
                          return card ? <PlayingCard key={id} card={card} small /> : null;
                        })}
                      </div>
                      <button
                        onClick={() => removePendingGroup(group.id)}
                        className="ml-auto text-xs text-red-300 hover:text-red-200"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {groupError && <p className="text-xs text-red-300">{groupError}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleGroupSelected}
                  disabled={!hasDrawn || selectedCardIds.length === 0}
                  className="rounded-lg border border-amber-300/60 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Group selected cards
                </button>
                <button
                  onClick={handleConfirmMeld}
                  disabled={!hasDrawn || !meldReady}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Meld
                </button>
              </div>
            </section>
          )}

          <section className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleDiscardSelected}
              disabled={!hasDrawn || selectedCardIds.length !== 1}
              className="rounded-lg border border-amber-300/60 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard selected card
            </button>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-100/60">
                {player.name === "You" ? "Your hand" : `${player.name}'s hand`}
                {player.hasMeldedContract && (
                  <span className="ml-2 text-amber-300">— contract melded</span>
                )}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => sortHand("suit")}
                  title="Group same-suit cards together — good for spotting runs"
                  className="rounded-md border border-emerald-100/20 px-2 py-1 text-xs font-medium text-emerald-100/70 hover:bg-emerald-900/40"
                >
                  Sort by suit
                </button>
                <button
                  onClick={() => sortHand("rank")}
                  title="Group same-rank cards together — good for spotting books"
                  className="rounded-md border border-emerald-100/20 px-2 py-1 text-xs font-medium text-emerald-100/70 hover:bg-emerald-900/40"
                >
                  Sort by rank
                </button>
              </div>
            </div>
            <DraggableHand
              cards={visibleHand}
              selectedCardIds={selectedCardIds}
              lastDrawnCardId={lastDrawnCardId}
              onCardClick={handleCardClick}
              onReorder={reorderHand}
            />
            <p className="mt-1 text-xs text-emerald-100/40">Drag a card to reorder your hand.</p>
          </section>
        </>
      )}
    </main>
  );
}
