"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "../GameContext";
import { usePlayerLevel } from "../PlayerLevelContext";
import { AI_THEORETICAL_LEVEL, personaBlurbFor } from "../lib/aiPersonas";
import { cardLabel, PlayingCard } from "../components/PlayingCard";
import { DraggableHand } from "../components/DraggableHand";
import { HandPreviewBar } from "../components/HandPreviewBar";
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
import { hapticSuccess } from "../lib/haptics";
import { layOffOptions, runCardRank, RUN_ORDER, validateManualGroup } from "@/meld";
import { handPenalty } from "@/scorer";
import { TUTORIAL_HUMAN_ID } from "@/tutorial";
import { Card, ContractRequirement, Meld } from "@/types";

interface PendingLayOff {
  card: Card;
  meld: Meld;
  options: ("low" | "high")[];
}

// data-tutorial targets that only ever render inside the hand drawer. A
// tutorial step spotlighting one of these needs the drawer forced open
// first, or TutorialOverlay has nothing in the DOM to find.
const DRAWER_TUTORIAL_TARGETS = new Set(["hand", "build-meld", "confirm-meld", "discard-btn"]);

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

/** contract.label split into one line per part for a compound contract
 * ("1 Book + 1 Run" -> ["1 Book", "1 Run"]), dropping the "+" itself; a
 * plain single-type label ("2 Books") comes back as its own one-element
 * array, unchanged. Needed once the round header's middle column (the
 * hand's live point total) narrowed the left column enough that a compound
 * label started wrapping mid-phrase right around the "+". */
function contractLabelLines(label: string): string[] {
  return label.split(" + ");
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
    isDailyDeal,
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
    canUndo,
    undoLastAction,
  } = useGame();
  const { level } = usePlayerLevel();
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [pendingLayOff, setPendingLayOff] = useState<PendingLayOff | null>(null);
  // Set only if layOff() itself reports failure — see handleMeldClick and
  // chooseLayOffDirection. Both used to call layOff() and then unconditionally
  // clear the selection right after, regardless of whether it actually
  // succeeded; if it silently failed for any reason, the card would still
  // visually deselect and the meld's highlight would still disappear,
  // reading exactly like a successful lay-off even though nothing happened
  // and the card never left the hand. One real, confirmed way this fired:
  // GameContext's own layOff() silently refuses before hasDrawn is true,
  // but the meld buttons' own isValidTarget/selectedCardCanLayOff checks
  // didn't account for that — a card selected before drawing made every
  // eligible meld light up as tappable regardless, so tapping one hit
  // exactly this silent-failure path. Both of those now also check
  // hasDrawn, so the message here (see layOffFailureReason) is mostly a
  // safety net for whatever narrower race is still possible — a
  // pass-and-play device passed mid-tap, a card laid off elsewhere a beat
  // earlier — rather than the primary way a player would ever see it.
  const [layOffError, setLayOffError] = useState<string | null>(null);
  const [pendingGroupChoice, setPendingGroupChoice] = useState<PendingGroupChoice | null>(null);
  const [activityOpen, setActivityOpen] = useState(() => isTutorial);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);
  const [tutorialOverlayVisible, setTutorialOverlayVisible] = useState(true);
  const [whoseTurnVisible, setWhoseTurnVisible] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState<Card | null>(null);
  // Reset alongside every other per-turn UI state.
  const [handDrawerOpen, setHandDrawerOpen] = useState(false);
  // Plain ref — an imperative handle for the drawer layout's "Lay off card"
  // button to scroll Table melds into view once it closes the drawer.
  const tableMeldsElRef = useRef<HTMLElement | null>(null);
  const prevHasDrawnRef = useRef(hasDrawn);
  const whoseTurnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (whoseTurnTimeoutRef.current) clearTimeout(whoseTurnTimeoutRef.current);
    };
  }, []);

  // The hand drawer is this codebase's
  // first real modal — the wild lay-off/turn-banner overlays are both
  // fixed-position but never block the page behind them the way this one's
  // backdrop does, so unlike those, this needs the two things a genuine
  // modal is expected to do: stop the page behind it from scrolling, and
  // close on Escape. No focus trap, deliberately — there's no established
  // pattern for one anywhere in this codebase yet, and this drawer's own
  // content (the hand, its sort buttons, meld-builder controls) is already
  // reachable by tab order without one.
  useEffect(() => {
    if (!handDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setHandDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [handDrawerOpen]);

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
    setLayOffError(null);
    setConfirmingDiscard(null);
    setHandDrawerOpen(false);
    // roundOver/gameOver added specifically for handDrawerOpen: melding out
    // on a whole-hand-meld round (e.g. 3 Runs) ends the round *and* the game
    // in the same action, with no discard step, and neither
    // currentPlayerIndex nor round necessarily changes when that happens —
    // so without watching these too, a game that ended while the hand
    // drawer was open left handDrawerOpen stuck true forever after. That in
    // turn left the drawer's own body-scroll-lock effect (keyed on
    // handDrawerOpen, above) with no reason to ever clean up — even though
    // GamePage had already switched to rendering GameOverScreen instead of
    // the drawer, that screen's own content inherited a permanently
    // scroll-locked <body>, which on a phone meant Back to Home (below the
    // fold) became genuinely unreachable.
  }, [state?.currentPlayerIndex, state?.round, state?.roundOver, state?.gameOver]);

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
      hapticSuccess();
    } else if (state?.roundOver) {
      playRoundWin();
      hapticSuccess();
    }
  }, [state?.roundOver, state?.gameOver]);

  // The hand drawer replaced what used to be a separate always-visible
  // scroll layout, so the tutorial now has to manage it itself: every step
  // whose target lives inside the drawer (see DRAWER_TUTORIAL_TARGETS)
  // forces it open, every other non-modal step forces it closed, so
  // whichever section a step spotlights is actually in the DOM for
  // TutorialOverlay to find. Modal steps (target: null — welcome,
  // wildcards, wrapup) are left alone: they render full-screen above
  // everything regardless of drawer state, so there's nothing to decide.
  useEffect(() => {
    if (!isTutorial || !tutorialOverlayVisible) return;
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    if (!step || step.target === null) return;
    const targets = Array.isArray(step.target) ? step.target : [step.target];
    setHandDrawerOpen(targets.some((t) => DRAWER_TUTORIAL_TARGETS.has(t)));
  }, [isTutorial, tutorialStepIndex, tutorialOverlayVisible]);

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
  const highlightLayoffs = isTutorial || savedSettings.highlightLayoffs;
  const showPlayerActivity = isTutorial || savedSettings.showPlayerActivity;
  const showWhoseTurn = isTutorial || savedSettings.showWhoseTurn;

  const meldsByOwner = new Map<string, Meld[]>();
  for (const meld of state.melds) {
    const list = meldsByOwner.get(meld.ownerId) ?? [];
    list.push(meld);
    meldsByOwner.set(meld.ownerId, list);
  }
  // Grouping books before runs (a stable sort, so within "all books, then
  // all runs" each type's melds keep the order they were originally
  // confirmed/laid off in) is just how Table melds always renders now —
  // it used to be its own toggle, but there was never a good reason to
  // turn it off.
  for (const list of meldsByOwner.values()) {
    list.sort((a, b) => (a.type === b.type ? 0 : a.type === "book" ? -1 : 1));
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
  // Drives the drawer layout's "Lay off card" button (see discardSection) —
  // deliberately independent of the highlightLayoffs setting above, which
  // only controls a hint/badge someone might turn off; this is a real
  // "would tapping a meld right now actually do anything" check, needed
  // regardless of whether the badges are on. hasDrawn matters here for the
  // same reason it matters for isValidTarget below: a card can be selected
  // before drawing (nothing stops planning ahead), and without this check
  // the button read as available even though the lay-off itself — gated on
  // hasDrawn inside GameContext's own layOff — would silently fail.
  const selectedCardCanLayOff =
    hasDrawn &&
    player.hasMeldedContract &&
    !!selectedCard &&
    state.melds.some((m) => layOffOptions(selectedCard, m).length > 0);

  function handleCardClick(card: Card) {
    setGroupError(null);
    setPendingLayOff(null);
    setLayOffError(null);
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

  // The specific reason a lay-off attempt just failed — checked in the same
  // order GameContext's own layOff() and gameEngine's layOffCard() actually
  // gate on, so this always names the *first* real blocker rather than a
  // generic catch-all. isValidTarget/selectedCardCanLayOff above already
  // keep the meld buttons themselves from inviting a click in the first two
  // cases — this is what still explains it on the rarer paths that can slip
  // past those (a pass-and-play device passed mid-tap, a card laid off
  // elsewhere a beat earlier) rather than leaving a still-confusing generic
  // message as the only thing left once a real reason was findable.
  function layOffFailureReason(): string {
    if (!hasDrawn) return "Draw a card before laying off.";
    if (!player.hasMeldedContract) return "Meld your own contract before laying off.";
    return "That card can't be laid off there anymore — try selecting it again.";
  }

  function handleMeldClick(meld: Meld) {
    if (!selectedCard || !player.hasMeldedContract) return;
    const options = layOffOptions(selectedCard, meld);
    if (options.length === 0) return;
    if (options.length === 1) {
      // Checking the result matters here, not just for correctness in the
      // abstract: clearing the selection unconditionally afterward — the
      // previous behavior — would make a silent failure look exactly like
      // a success (the card deselects, the meld's highlight goes away),
      // with nothing to say the card is actually still sitting in the
      // hand. See layOffError's own comment above.
      const ok = layOff(selectedCard.id, meld.id, options[0]);
      if (ok) {
        setSelectedCardIds([]);
        setLayOffError(null);
      } else {
        setLayOffError(layOffFailureReason());
      }
      return;
    }
    // A wild with room on both ends of a run — genuinely ambiguous which
    // rank it's meant to stand in for, so ask rather than guess.
    setPendingLayOff({ card: selectedCard, meld, options });
  }

  function chooseLayOffDirection(direction: "low" | "high") {
    if (!pendingLayOff) return;
    const ok = layOff(pendingLayOff.card.id, pendingLayOff.meld.id, direction);
    setPendingLayOff(null);
    if (ok) {
      setSelectedCardIds([]);
      setLayOffError(null);
    } else {
      setLayOffError(layOffFailureReason());
    }
  }

  // The drawer layout's "Lay off card" button (see discardSection) — the
  // card stays selected, so Table melds' own existing isValidTarget styling
  // picks it up as soon as the drawer's gone; this just closes the drawer
  // (its backdrop otherwise blocks every tap to the page behind it) and
  // scrolls to bring Table melds into view, since it can be well below the
  // fold with several players' melds on the table.
  function handleLayOffFromDrawer() {
    setHandDrawerOpen(false);
    tableMeldsElRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Extracted as its own const purely for readability — this, discardSection,
  // and handSection all mount inside the hand drawer (see its render further
  // down).
  const buildMeldSection = !player.hasMeldedContract && (
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
  );

  const discardSection = (
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
        <>
          {/* Laying off from inside the drawer means tapping a card here,
              then a meld on the page behind the drawer's own backdrop, which
              blocks that tap outright while the drawer's open. This closes
              it (see handleLayOffFromDrawer) instead of requiring a
              separate, unrelated tap (Done/backdrop/Escape) to do the same
              thing first. */}
          <button
            onClick={handleLayOffFromDrawer}
            disabled={!selectedCardCanLayOff || !!pendingLayOff}
            className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Lay off card
          </button>
          <button
            onClick={handleDiscardSelected}
            disabled={!hasDrawn || selectedCardIds.length !== 1 || !!pendingLayOff}
            className="rounded-lg border border-[var(--accent)]/60 px-4 py-2 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Discard selected card
          </button>
        </>
      )}
    </section>
  );

  const handSection = (
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
      {/* Keying on round + whose hand this is forces a full remount —
          not just a data update — exactly at the two moments a hand
          is genuinely "freshly dealt": a new round starting, or (in
          pass-and-play) control passing to a different player. A
          remount guarantees every card is a real new DOM node, so
          card-enter's staggered delay (see DraggableHand.tsx) plays
          for the whole hand together instead of only for whichever
          cards don't coincidentally share an id with what the same
          seat happened to hold last round (deck reshuffles reuse ids
          like "h-6-0" every round, so without this, some cards would
          silently skip the animation as if they'd already been there). */}
      <DraggableHand
        key={`${state.round}-${player.id}`}
        cards={visibleHand}
        selectedCardIds={selectedCardIds}
        lastDrawnCardId={lastDrawnCardId}
        onCardClick={handleCardClick}
        onReorder={reorderHand}
        layoffEligibleIds={layoffEligibleHandIds}
      />
      <p className="mt-1 text-xs text-[var(--faint)]">Drag a card to reorder your hand.</p>
    </section>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            // Unlike a real game, neither a tutorial nor a Daily Deal can be
            // resumed later — clear it outright instead of leaving it
            // dangling in memory.
            if (isTutorial || isDailyDeal) quitToHome();
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
        // flex justify-between, not grid — the score list below goes back
        // to one player per line (see its own comment), so its column no
        // longer needs a fixed width to stay wrap-free; flex just gives
        // each of these three its own natural width and spaces them apart,
        // which also happens to sidestep the old grid-auto-placement bug
        // outright: with justify-between, the *last* flex child always
        // stays pinned to the row's right edge regardless of how many
        // children exist, so there's no way for the score list to "slide
        // left" the way it once did in a grid when the middle cell's
        // content was conditionally empty. The middle cell is still always
        // rendered (content conditional, not the cell itself) purely for a
        // steady row height — not load-bearing for the slide bug anymore.
        // items-center (not items-start) vertically centers all three
        // against each other — the score list is taller than "Hand" in
        // every game with 2+ players, and top-aligning left "Hand" looking
        // stranded near the top with empty space below it.
        className="panel-elevated flex items-center justify-between gap-3 rounded-xl bg-[var(--panel)] px-4 py-3"
      >
        <div className="shrink-0 text-left">
          <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
            Round {state.round} of {state.selectedContracts.length}
          </p>
          <p className="text-lg font-bold leading-tight text-[var(--heading)]">
            {contractLabelLines(contract.label).map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
        <div className="min-w-0 px-1 text-center">
          {!player.isAI && (
            // Label-then-value, same two classes as the round-info cell's
            // own pair — reads as the same kind of thing at a glance
            // instead of a differently-shaped one-liner squeezed in between
            // them. Splitting across two lines also means each line's own
            // width is whichever of "Your hand"/"{name}'s hand" or "N pts"
            // is wider, not their combined width — narrower, if anything,
            // than the single-line version this replaces.
            <>
              <p className="text-xs uppercase tracking-wide text-[var(--faint)]">
                {player.name === "You" ? "Your hand" : `${player.name}'s hand`}
              </p>
              <p className="text-lg font-bold leading-tight text-[var(--heading)]">
                {handPenalty(player.hand)} pts
              </p>
            </>
          )}
        </div>
        {/* One player per line — the original layout, restored. A vertical
            list's width is set by its single widest line, not by how many
            players there are, so a bigger table just makes this column
            taller, never wider — unlike the horizontal, wrapping row this
            replaces, which got visibly cramped the moment AI names started
            carrying a Lv badge too (see AI_THEORETICAL_LEVEL). shrink-0
            keeps flex from ever shrinking this one to make room for its
            neighbors — the "Hand" cell above is the one meant to give way
            first if the row is ever genuinely tight. text-right (not
            text-center) so every line's score digit lands in the same
            spot instead of drifting left/right with each name's own
            length — only "Hand" in the middle is meant to read as a
            centered block; round info and this list are each pinned to
            their own edge of the header. */}
        <ul className="shrink-0 text-right text-xs text-[var(--muted)]">
          {[...state.players]
            .sort((a, b) => a.cumulativeScore - b.cumulativeScore)
            .map((p) => (
              <li key={p.id}>
                {p.id === YOU_PLAYER_ID && level && (
                  <span className="mr-1 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    Lv{level.level}
                  </span>
                )}
                {/* A cosmetic "power level" per difficulty, not a real
                    account level — see AI_THEORETICAL_LEVEL's own doc.
                    Muted/panel-toned rather than the accent-colored badge
                    above, so the two read as different kinds of thing at a
                    glance: one is this account's real, earned progress, the
                    other is flavor. */}
                {p.isAI && p.difficulty && (
                  <span className="mr-1 rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                    Lv{AI_THEORETICAL_LEVEL[p.difficulty]}
                  </span>
                )}
                {p.name}: <span className="font-semibold text-[var(--heading)]">{p.cumulativeScore}</span>
              </li>
            ))}
        </ul>
      </header>

      {canUndo && (
        <div
          role="status"
          // confirm-pop: this banner mounts fresh exactly once per successful
          // confirmMeld/layOff (canUndo flips false->true), same "no JS
          // state, just a fresh mount" trick as card-enter/level-up-pulse in
          // globals.css — completing your own meld is the actual "aha"
          // moment of Contract Rummy, and before this it got the exact same
          // plain-text banner as everything else on the board.
          className="confirm-pop flex items-center justify-between gap-3 rounded-lg bg-[var(--accent)]/15 px-4 py-2 text-sm"
        >
          <span className="text-[var(--muted)]">Meld or lay-off confirmed.</span>
          <button
            onClick={undoLastAction}
            className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
          >
            Undo
          </button>
        </div>
      )}

      {player.isAI ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-semibold text-[var(--heading)]">{player.name} is playing…</p>
          {/* Only ever set for a persona-named AI (see personaBlurbFor's own
              doc) — undefined, and so silently omitted, for anything else:
              a human name, or an AI from before personas existed whose name
              got carried over by a resumed saved game. */}
          {personaBlurbFor(player.name) && (
            <p className="text-xs text-[var(--faint)]">{personaBlurbFor(player.name)}</p>
          )}
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
            // Fixed + viewport-centered, the same idea as the "It's ___'s
            // turn!" banner above (position: fixed so scrolling can never
            // carry it out of view) — but centered rather than top-anchored,
            // and with a heavier shadow, because this one isn't a passing
            // notice: it's a decision the game is actually blocked on (see
            // the Discard button's disabled check below), so it needs to
            // read as "waiting on you," not just "FYI." On a tall Table
            // melds section on a phone, this used to render inline right
            // after the draw piles — exactly the kind of "answered near the
            // top of a page you've already scrolled past" spot most likely
            // to go unnoticed, since laying a wild off is something you do
            // by tapping a meld that can be far down the page.
            <div
              role="alertdialog"
              aria-label="Which card is this wild standing in for?"
              className="fixed inset-x-0 top-1/2 z-50 flex -translate-y-1/2 justify-center px-4"
            >
              <section className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-[var(--accent)]/60 bg-[var(--panel)] p-4 shadow-xl">
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
            </div>
          )}

          <section
            data-tutorial="table-melds"
            ref={tableMeldsElRef}
            className="panel-elevated rounded-xl bg-[var(--panel-soft)] p-4"
          >
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Table melds
            </h2>
            {layOffError && <p className="mb-2 text-xs text-[var(--danger)]">{layOffError}</p>}
            {state.melds.length === 0 ? (
              <p className="text-sm text-[var(--faint)]">No melds on the table yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {[...meldsByOwner.entries()].map(([ownerId, melds]) => {
                  const owner = state.players.find((p) => p.id === ownerId);
                  return (
                    <div key={ownerId}>
                      <p
                        className="mb-1 text-xs text-[var(--faint)]"
                        title={owner ? personaBlurbFor(owner.name) : undefined}
                      >
                        {owner?.name ?? ownerId}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {melds.map((meld) => {
                          // hasDrawn matters here for the same reason as
                          // selectedCardCanLayOff above: without it, a card
                          // selected before drawing made every eligible meld
                          // light up as tappable even though the lay-off
                          // itself — gated on hasDrawn inside GameContext's
                          // own layOff — would silently fail the instant you
                          // actually tapped one.
                          const isValidTarget =
                            hasDrawn &&
                            !pendingLayOff &&
                            !!selectedCard &&
                            player.hasMeldedContract &&
                            layOffOptions(selectedCard, meld).length > 0;
                          return (
                            <button
                              key={meld.id}
                              onClick={() => handleMeldClick(meld)}
                              disabled={!isValidTarget}
                              className={`max-w-full rounded-lg p-1 transition ${
                                isValidTarget ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]" : ""
                              }`}
                              title={meldLabel(meld)}
                            >
                              {/* overflow-x-auto lives on this inner div, not the
                                  button itself — a button that's also its own
                                  scroll container is a known rough edge on iOS
                                  Safari: with the tap target and the scrollable
                                  region being the exact same element, any real
                                  finger touch (which almost never lands with zero
                                  lateral drift the way a mouse click does) can get
                                  claimed by the scroll-gesture recognizer instead
                                  of firing the tap — worse the longer a run gets
                                  and the more there actually is to scroll. Only
                                  ever mattered on a real touchscreen, which is why
                                  it never showed up testing with a mouse. Splitting
                                  the two roles apart — the button stays a plain,
                                  stable tap target; this div is what scrolls when
                                  a meld is too long to fit — sidesteps that
                                  ambiguity entirely instead of trying to tune it.

                                  p-2 matters here for a less obvious reason: CSS
                                  forces overflow-y to compute as "auto" the
                                  moment overflow-x isn't "visible" (a browser
                                  can't scroll one axis and not the other), so
                                  this box clips on BOTH axes whether or not
                                  overflow-y-hidden is written explicitly. Two
                                  things stick out past a card's own border box
                                  by design and need room inside that clip
                                  region or they get sliced off: a wild card's
                                  "as <rank>" badge (PlayingCard's standInRank)
                                  sits 6px below its own card, and every card's
                                  own box-shadow/glow (.card-face) reaches a
                                  few px past its edges on every side. With no
                                  padding here, the badge's overhang landed
                                  right on the box's bottom clip edge (a thin
                                  mis-colored sliver instead of real text), and
                                  the first/last card in a run had its glow
                                  clipped flat at the row's left/right edge —
                                  visually distinct from every other card here,
                                  which still has a neighbor's glow overlapping
                                  its own to hide the same clipping. p-2 just
                                  gives both kinds of overhang somewhere to
                                  actually live, on every edge. */}
                              <div className="flex items-end gap-1 overflow-x-auto overflow-y-hidden p-2">
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
                              </div>
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

          <HandPreviewBar cards={visibleHand} onTap={() => setHandDrawerOpen(true)} />
          {handDrawerOpen && (
            <>
              {/* Backdrop: this drawer is the one genuine modal in the
                  codebase (see the scroll-lock/Escape effect above) — the
                  wild lay-off/turn-banner overlays are fixed-position too
                  but never block the page behind them the way this does.
                  Tapping it closes the drawer, same as the Done button. */}
              <div
                aria-hidden="true"
                onClick={() => setHandDrawerOpen(false)}
                className="fixed inset-0 z-[45] bg-black/50"
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Manage your hand"
                className="fixed inset-x-0 bottom-0 z-[46] flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg)] p-4 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--heading)]">Manage your hand</h2>
                  <button
                    onClick={() => setHandDrawerOpen(false)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
                  >
                    Done
                  </button>
                </div>
                {buildMeldSection}
                {discardSection}
                {handSection}
              </div>
            </>
          )}

          {/* Reserves room at the very bottom of the scrollable page for
              HandPreviewBar's own fixed height — without it, whatever ends
              up being the last real content on the page (Table melds, most
              likely, with several players' melds pushing the page's true
              end past the viewport) can be permanently covered with no way
              to scroll further and reveal it: the bar never hides in this
              layout, and the *page's own* scroll extent has no idea a fixed
              element is sitting on top of its end. */}
          <div aria-hidden="true" className="h-20 md:h-28" />
        </>
      )}

      {tutorialOverlayNode}
    </main>
  );
}
