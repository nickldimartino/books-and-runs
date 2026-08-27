"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { cardLabel, PlayingCard } from "../components/PlayingCard";
import { DraggableHand } from "../components/DraggableHand";
import { PassGate } from "../components/PassGate";
import { BuyOfferGate } from "../components/BuyOfferGate";
import { RoundSummary } from "../components/RoundSummary";
import { GameOverScreen } from "../components/GameOverScreen";
import { TutorialOverlay } from "../components/TutorialOverlay";
import { TUTORIAL_STEPS } from "../lib/tutorialSteps";
import { consumeTutorialStartingFlag, loadSavedGame } from "../lib/localSave";
import { YOU_PLAYER_ID } from "../lib/recordGameResult";
import { loadLocalSettings } from "../lib/settingsStore";
import { playGameWin, playRoundWin } from "../lib/sound";
import { layOffOptions, runCardRank, RUN_ORDER, validateManualGroup } from "@/meld";
import { handPenalty } from "@/scorer";
import { TUTORIAL_HUMAN_ID } from "@/tutorial";
import { Card, ContractRequirement, Meld } from "@/types";

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
  // Set for a run whose wild placement the player explicitly chose (see
  // PendingGroupChoice) — carried through to confirmMeld so the final
  // server-side meld reproduces the exact same choice, not a different
  // (still-valid) one.
  runStartIndex?: number;
}

interface PendingGroupChoice {
  cards: Card[];
  cardIds: string[];
  options: number[];
}

/** For one candidate run window, which rank(s) a wild in this selection
 * would stand in for — e.g. "2" or "6" for the two ways naturals 3-4-5 plus
 * one wild could resolve. Uses wildCardIds rather than comparing a card's
 * own rank to its slot's rank — a 2 standing in for a *different* suit's
 * "2" slot has a rank that happens to match its slot anyway, which a naive
 * comparison would misread as "natural, not a stand-in." */
function wildStandInLabel(cards: Card[], contract: ContractRequirement, start: number): string {
  const result = validateManualGroup(cards, contract, start);
  if (!result.orderedCards || !result.wildCardIds) return String(start);
  const ranks: string[] = [];
  result.orderedCards.forEach((c, i) => {
    if (result.wildCardIds!.has(c.id)) {
      const expected = RUN_ORDER[start + i];
      ranks.push(expected === "JOKER" ? "JKR" : expected);
    }
  });
  return ranks.join(", ");
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
    isTutorial,
    revealHand,
    draw,
    confirmMeld,
    layOff,
    discard,
    sortHand,
    reorderHand,
    respondToBuy,
    advanceRound,
    quitToHome,
    continueGame,
    startTutorialGame,
  } = useGame();
  const { level } = usePlayerLevel();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [pendingLayOff, setPendingLayOff] = useState<PendingLayOff | null>(null);
  const [pendingGroupChoice, setPendingGroupChoice] = useState<PendingGroupChoice | null>(null);
  const [activityOpen, setActivityOpen] = useState(() => isTutorial);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [tutorialOverlayVisible, setTutorialOverlayVisible] = useState(true);
  const [whoseTurnVisible, setWhoseTurnVisible] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState<Card | null>(null);
  const prevHasDrawnRef = useRef(hasDrawn);
  const whoseTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (whoseTurnTimeoutRef.current) clearTimeout(whoseTurnTimeoutRef.current);
    };
  }, []);

  function handleShowWhoseTurn() {
    setWhoseTurnVisible(true);
    if (whoseTurnTimeoutRef.current) clearTimeout(whoseTurnTimeoutRef.current);
    whoseTurnTimeoutRef.current = setTimeout(() => setWhoseTurnVisible(false), 5000);
  }

  // Only bounces home for a *genuinely* orphaned visit to /game — landing
  // here with no active game at all (a stale bookmark, a direct URL visit).
  // Once a real game has been loaded, this must stay quiet if state later
  // goes back to null: that's exactly what happens when Play
  // again/Home/quitting a tutorial fire — they null the state via
  // quitToHome() and then explicitly navigate themselves. Redirecting home
  // here too raced that explicit navigation (this effect fires on the
  // resulting re-render, after the explicit router.push already went out,
  // so it could — and did — overwrite "Play again"'s destination with "/").
  //
  // Before giving up, though, try loading a saved game directly: Home's
  // "Continue Local Game" loads the game into memory and then navigates
  // here client-side, but if that navigation's own fetch fails for any
  // reason, Next falls back to a real browser navigation instead of a
  // smooth SPA transition. A real navigation restarts every React provider
  // from scratch, wiping the just-loaded in-memory game before this page ever
  // saw it, which read as "Continue reloads and dumps me back on Home."
  // Recovering straight from localStorage here means it doesn't matter
  // whether the trip over was a smooth transition or a hard reload.
  // A tutorial start hits this same gap but can't be recovered from
  // localStorage — persist() deliberately never saves a tutorial (see its
  // isTutorialRef guard). New Game sets a small sessionStorage marker right
  // before starting one specifically so this can tell "a tutorial start
  // landed here with nothing to show" apart from "genuinely nothing going
  // on" — and since the tutorial is always the same fixed, scripted deal
  // (src/tutorial.ts), restarting it fresh here loses nothing real.
  const everHadStateRef = useRef(false);
  if (state) everHadStateRef.current = true;
  // Guards the whole recovery attempt separately from state/everHadStateRef,
  // both of which only update on the *next* render — React's dev-mode
  // Strict Mode runs a freshly-mounted effect twice back to back with no
  // render in between, so both invocations would otherwise see the same
  // stale (still-null) state. That's harmless for continueGame(), which
  // just re-reads localStorage each time, but consumeTutorialStartingFlag()
  // deliberately consumes the flag on read — the second invocation would
  // find it already gone and fall through to redirecting home, undoing
  // whatever the first invocation just started. Setting this ref
  // synchronously as the first line of the effect body closes that gap.
  const recoveryAttemptedRef = useRef(false);
  useEffect(() => {
    if (state || everHadStateRef.current || recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;
    if (loadSavedGame()) {
      continueGame();
    } else if (consumeTutorialStartingFlag()) {
      startTutorialGame();
    } else {
      router.replace("/");
    }
  }, [state, continueGame, startTutorialGame, router]);

  useEffect(() => {
    setSelectedCardIds([]);
    setPendingGroups([]);
    setGroupError(null);
    setPendingLayOff(null);
    setConfirmingDiscard(null);
  }, [state?.currentPlayerIndex, state?.round]);

  // If the selection changes out from under a pending confirmation (the
  // only way that can happen here is the defensive card-not-found guard in
  // handleDiscardSelected, but this keeps the two states from ever
  // silently diverging), drop the stale confirmation rather than let it
  // reference a card no longer selected.
  useEffect(() => {
    if (confirmingDiscard && !selectedCardIds.includes(confirmingDiscard.id)) {
      setConfirmingDiscard(null);
    }
  }, [selectedCardIds, confirmingDiscard]);

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

  // Auto-advances gated tutorial steps once their underlying action actually
  // happens — draw, meld a book, meld a run, confirm the meld, or discard.
  // Order matters here: this reads prevHasDrawnRef *before* updating it, so
  // it must run above (and thus after, in the commit) the ref's own update.
  useEffect(() => {
    const wasDrawn = prevHasDrawnRef.current;
    prevHasDrawnRef.current = hasDrawn;
    if (!isTutorial || !state || !tutorialOverlayVisible) return;
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    if (!step) return;
    const human = state.players.find((p) => p.id === TUTORIAL_HUMAN_ID);
    let satisfied = false;
    switch (step.gate.type) {
      case "drawn":
        satisfied = hasDrawn;
        break;
      case "grouped": {
        const meldType = step.gate.meldType;
        satisfied = pendingGroups.some((g) => g.type === meldType);
        break;
      }
      case "melded":
        satisfied = !!human?.hasMeldedContract;
        break;
      case "discarded":
        satisfied = wasDrawn && !hasDrawn && !!human?.hasMeldedContract;
        break;
    }
    if (satisfied) {
      setTutorialStepIndex((i) => {
        if (i >= TUTORIAL_STEPS.length - 1) {
          setTutorialOverlayVisible(false);
          return i;
        }
        return i + 1;
      });
    }
  }, [isTutorial, state, tutorialOverlayVisible, tutorialStepIndex, hasDrawn, pendingGroups]);

  function advanceTutorial() {
    setTutorialStepIndex((i) => {
      if (i >= TUTORIAL_STEPS.length - 1) {
        setTutorialOverlayVisible(false);
        return i;
      }
      return i + 1;
    });
  }

  function skipTutorial() {
    setTutorialOverlayVisible(false);
    quitToHome();
    router.push("/");
  }

  if (!state) return null;

  // Computed once and rendered as a sibling on every branch below, tutorial
  // or not — a pending step (the "wrapup" one especially) needs to stay
  // dismissable no matter what's on screen underneath it. Placing this only
  // in the main return further down meant it silently vanished — not
  // actually dismissed, just not rendered — the instant a PassGate/AI-turn/
  // round-end screen took over, then reappeared later looking like a bug.
  const tutorialStep = isTutorial ? TUTORIAL_STEPS[tutorialStepIndex] : undefined;
  const tutorialOverlayNode =
    tutorialOverlayVisible && tutorialStep ? (
      <TutorialOverlay
        step={tutorialStep}
        stepIndex={tutorialStepIndex}
        totalSteps={TUTORIAL_STEPS.length}
        onContinue={advanceTutorial}
        onSkip={skipTutorial}
      />
    ) : null;

  if (state.gameOver) return <GameOverScreen state={state} />;
  if (state.roundOver) {
    return (
      <>
        <RoundSummary state={state} roundStartScores={roundStartScores} onNextRound={advanceRound} />
        {tutorialOverlayNode}
      </>
    );
  }

  if (buyOffer) {
    return (
      <>
        <BuyOfferGate
          playerName={buyOffer.playerName}
          card={buyOffer.card}
          onRespond={respondToBuy}
        />
        {tutorialOverlayNode}
      </>
    );
  }

  const player = state.players[state.currentPlayerIndex];

  if (!player.isAI && awaitingReveal) {
    return (
      <>
        <PassGate name={player.name} onReveal={revealHand} />
        {tutorialOverlayNode}
      </>
    );
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

  // The tutorial shows off every optional feature regardless of what's
  // actually saved in Settings — it never writes back to it, so your real
  // preferences are exactly as you left them once the tutorial ends.
  const savedSettings = loadLocalSettings();
  const groupMeldsByType = isTutorial || savedSettings.groupMeldsByType;
  const highlightLayoffs = isTutorial || savedSettings.highlightLayoffs;
  const showPlayerActivity = isTutorial || savedSettings.showPlayerActivity;
  const showWhoseTurn = isTutorial || savedSettings.showWhoseTurn;

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

  // A confirmation step before the one action that actually ends a turn —
  // not an undo (nothing done earlier this turn can be reversed), just a
  // last check before handing the device to the next player or passing a
  // turn that can't be taken back.
  function handleDiscardSelected() {
    if (selectedCardIds.length !== 1) return;
    const card = player.hand.find((c) => c.id === selectedCardIds[0]);
    if (!card) return;
    setConfirmingDiscard(card);
  }

  function confirmDiscard() {
    if (!confirmingDiscard) return;
    discard(confirmingDiscard.id);
    setConfirmingDiscard(null);
    setSelectedCardIds([]);
    setPendingLayOff(null);
  }

  function cancelDiscard() {
    setConfirmingDiscard(null);
  }

  function handleGroupSelected() {
    if (selectedCardIds.length === 0) return;
    const cards = selectedCardIds
      .map((id) => player.hand.find((c) => c.id === id))
      .filter((c): c is Card => !!c);
    const result = validateManualGroup(cards, contract);
    if (result.needsRunStartChoice) {
      setPendingGroupChoice({ cards, cardIds: selectedCardIds, options: result.needsRunStartChoice });
      setGroupError(null);
      return;
    }
    if (!result.valid || !result.type) {
      setGroupError(result.reason ?? "Not a valid book or run.");
      return;
    }
    setPendingGroups((prev) => [
      ...prev,
      {
        id: `group-${Date.now()}-${prev.length}`,
        type: result.type!,
        cardIds: selectedCardIds,
        runStartIndex: result.runStartIndex,
      },
    ]);
    setSelectedCardIds([]);
    setGroupError(null);
  }

  function chooseGroupRunStart(start: number) {
    if (!pendingGroupChoice) return;
    const result = validateManualGroup(pendingGroupChoice.cards, contract, start);
    if (!result.valid || !result.type) {
      // Shouldn't happen — `start` came from our own offered options — but
      // fail safely rather than stage something invalid.
      setGroupError(result.reason ?? "Not a valid book or run.");
      setPendingGroupChoice(null);
      return;
    }
    setPendingGroups((prev) => [
      ...prev,
      {
        id: `group-${Date.now()}-${prev.length}`,
        type: result.type!,
        cardIds: pendingGroupChoice.cardIds,
        runStartIndex: result.runStartIndex,
      },
    ]);
    setPendingGroupChoice(null);
    setSelectedCardIds([]);
    setGroupError(null);
  }

  function removePendingGroup(id: string) {
    setPendingGroups((prev) => prev.filter((g) => g.id !== id));
  }

  function handleConfirmMeld() {
    const success = confirmMeld(
      pendingGroups.map((g) => g.cardIds),
      pendingGroups.map((g) => g.runStartIndex)
    );
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
          onClick={() => {
            // Unlike a real game, a tutorial can't be resumed later — clear
            // it outright instead of leaving it dangling in memory.
            if (isTutorial) quitToHome();
            router.push("/");
          }}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          ← Home
        </button>
        <div className="flex items-center gap-2">
          {showWhoseTurn && (
            <button
              onClick={handleShowWhoseTurn}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              Who&apos;s turn is it?
            </button>
          )}
          <Link
            href="/how-to-play"
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            How to play
          </Link>
        </div>
      </div>

      {whoseTurnVisible && (
        <div
          role="status"
          className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent)] shadow-lg"
        >
          It&apos;s Jenny&apos;s turn!
        </div>
      )}

      <header
        data-tutorial="round-header"
        className="panel-elevated flex items-center justify-between rounded-xl bg-[var(--panel)] px-4 py-3"
      >
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
          <section data-tutorial="draw-piles" className="flex items-center justify-center gap-6">
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

          <section data-tutorial="table-melds" className="panel-elevated rounded-xl bg-[var(--panel-soft)] p-4">
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
                              className={`flex max-w-full items-end gap-1 overflow-x-auto overflow-y-hidden rounded-lg p-1 transition ${
                                isValidTarget ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : ""
                              }`}
                              title={meldLabel(meld)}
                            >
                              {meld.cards.map((c, i) => {
                                // A wild's badge shows what it's standing in
                                // for. meld.wildCardIds is the ground truth
                                // for which cards are actually acting as a
                                // wild here — comparing a card's own rank to
                                // its slot's rank instead would misfire for
                                // a 2 standing in for a *different* suit's
                                // own "2" slot, whose rank happens to match
                                // its slot anyway despite genuinely being a
                                // stand-in, not a natural fit.
                                const isWildHere = meld.wildCardIds?.includes(c.id) ?? false;
                                const standInRank =
                                  isWildHere && meld.type === "run" ? runCardRank(meld, i) : undefined;
                                return <PlayingCard key={c.id} card={c} small standInRank={standInRank} />;
                              })}
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

          {showPlayerActivity && (
            <section data-tutorial="player-activity" className="panel-elevated rounded-xl bg-[var(--panel-soft)] p-4">
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
                        <th className="pb-2 pr-3 font-medium">In hand</th>
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
                            <td className="py-2 pr-3 text-[var(--muted)]">{p.hand.length}</td>
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
                    Mirrors what you&apos;d see at a real table. In hand is always current; the
                    discard/pickup columns reset at the start of each round. Blind draws from the
                    draw pile aren&apos;t shown, since no one could see those in person either.
                  </p>
                </div>
              )}
            </section>
          )}

          {!player.hasMeldedContract && (
            <section data-tutorial="build-meld" className="panel-elevated flex flex-col gap-3 rounded-xl bg-[var(--panel-soft)] p-4">
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

              {pendingGroupChoice && (
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--accent)]/60 bg-[var(--panel)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                    Which card is the wild standing in for?
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    {pendingGroupChoice.options.map((start) => (
                      <button
                        key={start}
                        onClick={() => chooseGroupRunStart(start)}
                        className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] hover:bg-[var(--panel-soft)]"
                      >
                        {wildStandInLabel(pendingGroupChoice.cards, contract, start)}
                      </button>
                    ))}
                    <button
                      onClick={() => setPendingGroupChoice(null)}
                      className="text-sm text-[var(--faint)] hover:text-[var(--muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {groupError && <p className="text-xs text-[var(--danger)]">{groupError}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleGroupSelected}
                  disabled={!hasDrawn || selectedCardIds.length === 0 || !!pendingGroupChoice}
                  className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Group selected cards
                </button>
                <button
                  data-tutorial="confirm-meld"
                  onClick={handleConfirmMeld}
                  disabled={!hasDrawn || !meldReady || !!pendingGroupChoice}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Confirm Meld
                </button>
              </div>
            </section>
          )}

          <section data-tutorial="discard-btn" className="flex flex-wrap items-center justify-center gap-3">
            {confirmingDiscard ? (
              <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2">
                <span className="text-sm text-[var(--muted)]">
                  Discard the {cardLabel(confirmingDiscard)} and end your turn?
                </span>
                <button
                  onClick={confirmDiscard}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow"
                >
                  Confirm
                </button>
                <button
                  onClick={cancelDiscard}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={handleDiscardSelected}
                disabled={!hasDrawn || selectedCardIds.length !== 1 || !!pendingLayOff}
                className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Discard selected card
              </button>
            )}
          </section>

          <section data-tutorial="hand">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {player.name === "You" ? "Your hand" : `${player.name}'s hand`}
                <span className="ml-2 font-normal normal-case text-[var(--muted)]">
                  ({handPenalty(player.hand)} pts)
                </span>
                {player.hasMeldedContract && (
                  <span className="ml-2 text-[var(--accent)]">— contract melded</span>
                )}
              </h2>
              <div className="flex flex-wrap gap-2">
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

      {tutorialOverlayNode}
    </main>
  );
}
