// A plain, JSON-serializable record of one atomic action taken during a
// solo/pass-and-play game — draw, meld, lay off, or discard, whichever
// player's turn it was (human or AI, logged identically). Appended to
// alongside GameState (see GameContext.tsx's moveLogRef) so a finished game
// can be replayed and verified server-side (the planned solo-verify Edge
// Function) from nothing but its starting seed and this log — the actual
// authority for "did this really happen" is always the deterministic
// engine functions in gameEngine.ts re-running each entry in order, never
// anything the client claims about the outcome.
//
// `seat` is state.currentPlayerIndex at the moment the entry was recorded
// — not needed by a replay to know whose turn it is (that's always already
// implied by state, the same way every gameEngine.ts function reads
// currentPlayer(state) rather than taking a player argument), but kept as
// a redundant self-consistency check a replayer can assert against.
//
// A round boundary needs no entry of its own: gameEngine.ts sets
// state.roundOver on the entry that ends a round, and a replayer (like
// GameContext.tsx's own advanceRound) just calls startNextRound whenever it
// sees that, before moving on to the next logged entry.

export type MoveLogEntry =
  | { seat: number; type: "draw"; fromDiscard: boolean }
  // attemptMeldContract's auto-solve — AI's only meld path. No extra
  // arguments: it's a deterministic function of state alone, so a replayer
  // reproduces the identical result just by calling it again.
  | { seat: number; type: "meldContract" }
  // meldChosenGroups — a human's manual group choice.
  | {
      seat: number;
      type: "meldGroups";
      groups: string[][];
      preferredRunStarts?: (number | undefined)[];
    }
  | { seat: number; type: "layOff"; cardId: string; meldId: string; position?: "low" | "high" }
  // cardId is null only for the round-7 whole-hand-meld auto-out, where
  // discardAndAdvance is called with no card to discard.
  | { seat: number; type: "discard"; cardId: string | null };
