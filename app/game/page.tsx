"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { PlayingCard } from "../components/PlayingCard";
import { DraggableHand } from "../components/DraggableHand";
import { PassGate } from "../components/PassGate";
import { BuyOfferGate } from "../components/BuyOfferGate";
import { RoundSummary } from "../components/RoundSummary";
import { GameOverScreen } from "../components/GameOverScreen";
import { YOU_PLAYER_ID } from "../lib/recordGameResult";
import { loadLocalSettings } from "../lib/settingsStore";
import { playGameWin, playRoundWin } from "../lib/sound";
import { layOffOptions, runCardRank, RUN_ORDER, validateManualGroup } from "@/meld";
import { Card, Meld } from "@/types";

interface PendingLayOff {
  card: Card;
  meld: Meld;
  options: ("low" | "high")[];
}

/** The rank a lay-off in this direction would represent, for labeling the choice. */
function directionRank(meld: Meld, direction: "low" | "high"): string {
  const start = meld.runStartIndex ?? 0;
  const end = start + meld.cards.length - 1;
  const idx = direction === "low" ? start - 1 : end + 1;
  const rank = RUN_ORDER[idx];
  return rank === "JOKER" ? "JKR" : rank;
}

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
    buyOffer,
    revealHand,
    draw,
    confirmMeld,
    layOff,
    discard,
    sortHand,
    reorderHand,
    respondToBuy,
    advanceRound,
  } = useGame();
  const { level } = usePlayerLevel();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [pendingLayOff, setPendingLayOff] = useState<PendingLayOff | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  useEffect(() => {
    setSelectedCardIds([]);
    setPendingGroups([]);
    setGroupError(null);
    setPendingLayOff(null);
  }, [state?.currentPlayerIndex, state?.round]);

  // Fires exactly once per false→true transition, since these are plain
  // booleans in the dep array — a game-over round is also round-over, so
  // gameOver takes priority to avoid playing both chimes at once.
  useEffect(() => {
    if (state?.gameOver) {
      playGameWin();
    } else if (state?.roundOver) {
      playRoundWin();
    }
  }, [state?.roundOver, state?.gameOver]);

  if (!state) return null;

  if (state.gameOver) return <GameOverScreen state={state} />;
  if (state.roundOver) {
    return (
      <RoundSummary state={state} roundStartScores={roundStartScores} onNextRound={advanceRound} />
    );
  }

  if (buyOffer) {
    return (
      <BuyOfferGate
        playerName={buyOffer.playerName}
        card={buyOffer.card}
        onRespond={respondToBuy}
      />
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
  const cardsNotYetGrouped = player.hand.length - stagedCardIds.size;
  const meldReady =
    stagedBooks === contract.books &&
    stagedRuns === contract.runs &&
    (!contract.wholeHandMeld || cardsNotYetGrouped === 0);

  const { groupMeldsByType, highlightLayoffs } = loadLocalSettings();

  const meldsByOwner = new Map<string, Meld[]>();
  for (const meld of state.melds) {
    const list = meldsByOwner.get(meld.ownerId) ?? [];
    list.push(meld);
    meldsByOwner.set(meld.ownerId, list);
  }
  if (groupMeldsByType) {
    // A stable sort, so within "all books, then all runs" each type's melds
    // keep the order they were originally confirmed/laid off in.
    for (const list of meldsByOwner.values()) {
      list.sort((a, b) => (a.type === b.type ? 0 : a.type === "book" ? -1 : 1));
    }
  }

  // Shown even before you've melded your own contract (when a lay-off isn't
  // actually clickable yet) — the point is letting you plan which cards to
  // keep for a lay-off later, not just which ones are actionable right now.
  const layoffEligibleHandIds = new Set<string>();
  let discardTopCanLayOff = false;
  if (highlightLayoffs) {
    for (const c of player.hand) {
      if (state.melds.some((m) => layOffOptions(c, m).length > 0)) layoffEligibleHandIds.add(c.id);
    }
    discardTopCanLayOff = !!discardTop && state.melds.some((m) => layOffOptions(discardTop, m).length > 0);
  }

  function handleCardClick(card: Card) {
    setGroupError(null);
    setPendingLayOff(null);
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
    const options = layOffOptions(selectedCard, meld);
    if (options.length === 0) return;
    if (options.length === 1) {
      layOff(selectedCard.id, meld.id, options[0]);
      setSelectedCardIds([]);
      return;
    }
    // A wild with room on both ends of a run — genuinely ambiguous which
    // rank it's meant to stand in for, so ask rather than guess.
    setPendingLayOff({ card: selectedCard, meld, options });
  }

  function chooseLayOffDirection(direction: "low" | "high") {
    if (!pendingLayOff) return;
    layOff(pendingLayOff.card.id, pendingLayOff.meld.id, direction);
    setPendingLayOff(null);
    setSelectedCardIds([]);
  }

  function handleDiscardSelected() {
    if (selectedCardIds.length !== 1) return;
    discard(selectedCardIds[0]);
    setSelectedCardIds([]);
    setPendingLayOff(null);
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
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          ← Home
        </button>
        <Link
          href="/how-to-play"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          How to play
        </Link>
      </div>

      <header className="flex items-center justify-between rounded-xl bg-[var(--panel)] px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
            Round {state.round} of {state.selectedContracts.length}
          </p>
          <p className="text-lg font-bold text-[var(--heading)]">{contract.label}</p>
        </div>
        <ul className="text-right text-xs text-[var(--muted)]">
          {[...state.players]
            .sort((a, b) => a.cumulativeScore - b.cumulativeScore)
            .map((p) => (
              <li key={p.id}>
                {p.id === YOU_PLAYER_ID && level && (
                  <span className="mr-1 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    Lv{level.level}
                  </span>
                )}
                {p.name}: <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore}</span>
              </li>
            ))}
        </ul>
      </header>

      {player.isAI ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-semibold text-[var(--heading)]">{player.name} is playing…</p>
          {aiThinking && <p className="text-sm text-[var(--faint)]">thinking…</p>}
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
              <span className="text-xs text-[var(--faint)]">Draw ({state.drawPile.length})</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => draw(true)}
                disabled={hasDrawn || !discardTop}
                className="disabled:opacity-50"
                aria-label="Draw from discard"
              >
                {discardTop ? (
                  <PlayingCard card={discardTop} canLayOff={discardTopCanLayOff} />
                ) : (
                  <div className="h-20 w-14 rounded-lg border-2 border-dashed border-[var(--border)]" />
                )}
              </button>
              <span className="text-xs text-[var(--faint)]">Discard pile</span>
            </div>
          </section>

          {!hasDrawn && (
            <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-center text-xs font-medium text-[var(--accent)]">
              Draw a card from the pile or discard pile to start your turn.
            </p>
          )}

          {pendingLayOff && (
            <section className="flex flex-col gap-3 rounded-xl border border-[var(--accent)]/60 bg-[var(--panel)] p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Which card is this wild standing in for?
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => chooseLayOffDirection("low")}
                  className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] hover:bg-[var(--panel-soft)]"
                >
                  {directionRank(pendingLayOff.meld, "low")}
                </button>
                <button
                  onClick={() => chooseLayOffDirection("high")}
                  className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] hover:bg-[var(--panel-soft)]"
                >
                  {directionRank(pendingLayOff.meld, "high")}
                </button>
                <button
                  onClick={() => setPendingLayOff(null)}
                  className="text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                >
                  Cancel
                </button>
              </div>
            </section>
          )}

          <section className="rounded-xl bg-[var(--panel-soft)] p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Table melds
            </h2>
            {state.melds.length === 0 ? (
              <p className="text-sm text-[var(--faint)]">No melds on the table yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {[...meldsByOwner.entries()].map(([ownerId, melds]) => {
                  const owner = state.players.find((p) => p.id === ownerId);
                  return (
                    <div key={ownerId}>
                      <p className="mb-1 text-xs text-[var(--faint)]">{owner?.name ?? ownerId}</p>
                      <div className="flex flex-wrap gap-3">
                        {melds.map((meld) => {
                          const isValidTarget =
                            !pendingLayOff &&
                            !!selectedCard &&
                            player.hasMeldedContract &&
                            layOffOptions(selectedCard, meld).length > 0;
                          return (
                            <button
                              key={meld.id}
                              onClick={() => handleMeldClick(meld)}
                              disabled={!isValidTarget}
                              className={`flex items-end gap-1 rounded-lg p-1 transition ${
                                isValidTarget ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : ""
                              }`}
                              title={meldLabel(meld)}
                            >
                              {meld.cards.map((c, i) => (
                                <PlayingCard
                                  key={c.id}
                                  card={c}
                                  small
                                  standInRank={c.isWild ? runCardRank(meld, i) : undefined}
                                />
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

          <section className="rounded-xl bg-[var(--panel-soft)] p-4">
            <button
              onClick={() => setActivityOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left"
              aria-expanded={activityOpen}
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Player activity this round
              </h2>
              <span className="text-xs text-[var(--faint)]">{activityOpen ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {activityOpen && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-xs text-[var(--faint)]">
                      <th className="pb-2 pr-3 font-medium">Player</th>
                      <th className="pb-2 pr-3 font-medium">Latest discard</th>
                      <th className="pb-2 font-medium">Latest pickup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.players.map((p) => {
                      const latestDiscard = [...state.discardHistory]
                        .reverse()
                        .find((e) => e.playerId === p.id)?.card;
                      const latestPickup = [...state.pickupHistory]
                        .reverse()
                        .find((e) => e.playerId === p.id)?.card;
                      return (
                        <tr key={p.id} className="border-t border-[var(--border)]">
                          <td className="py-2 pr-3 text-[var(--heading)]">{p.name}</td>
                          <td className="py-2 pr-3">
                            {latestDiscard ? (
                              <PlayingCard card={latestDiscard} small />
                            ) : (
                              <span className="text-[var(--faint)]">—</span>
                            )}
                          </td>
                          <td className="py-2">
                            {latestPickup ? (
                              <PlayingCard card={latestPickup} small />
                            ) : (
                              <span className="text-[var(--faint)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-[var(--faint)]">
                  Mirrors what you&apos;d see at a real table — resets at the start of each round.
                  Blind draws from the draw pile aren&apos;t shown, since no one could see those in
                  person either.
                </p>
              </div>
            )}
          </section>

          {!player.hasMeldedContract && (
            <section className="flex flex-col gap-3 rounded-xl bg-[var(--panel-soft)] p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Build your meld — this round needs {contractNeedLabel(contract.books, contract.runs)}
              </h2>

              {contract.wholeHandMeld && (
                <p className="text-xs text-[var(--muted)]">
                  This is the final round — there&apos;s no discard once you meld, so every card in
                  your hand has to go into these runs.
                  {cardsNotYetGrouped > 0 &&
                    ` ${cardsNotYetGrouped} card${cardsNotYetGrouped > 1 ? "s" : ""} not yet grouped.`}
                </p>
              )}

              {pendingGroups.length > 0 && (
                <div className="flex flex-col gap-2">
                  {pendingGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--panel)] p-2"
                    >
                      <span className="w-12 shrink-0 text-xs font-semibold capitalize text-[var(--accent)]">
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
                        className="ml-auto text-xs text-[var(--danger)] hover:opacity-80"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {groupError && <p className="text-xs text-[var(--danger)]">{groupError}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleGroupSelected}
                  disabled={!hasDrawn || selectedCardIds.length === 0}
                  className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Group selected cards
                </button>
                <button
                  onClick={handleConfirmMeld}
                  disabled={!hasDrawn || !meldReady}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Meld
                </button>
              </div>
            </section>
          )}

          <section className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleDiscardSelected}
              disabled={!hasDrawn || selectedCardIds.length !== 1 || !!pendingLayOff}
              className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Discard selected card
            </button>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {player.name === "You" ? "Your hand" : `${player.name}'s hand`}
                {player.hasMeldedContract && (
                  <span className="ml-2 text-[var(--accent)]">— contract melded</span>
                )}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => sortHand("suit")}
                  title="Group same-suit cards together — good for spotting runs"
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                >
                  Sort by suit
                </button>
                <button
                  onClick={() => sortHand("rank")}
                  title="Group same-rank cards together — good for spotting books"
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
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
              layoffEligibleIds={layoffEligibleHandIds}
            />
            <p className="mt-1 text-xs text-[var(--faint)]">Drag a card to reorder your hand.</p>
          </section>
        </>
      )}
    </main>
  );
}
