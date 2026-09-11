// Runtime validation of what the multiplayer Edge Function sends back.
// The function is the authority and this app trusts its rules — but a
// malformed or truncated response (a deploy mid-flight, a proxy mangling
// JSON, a bug) should surface as a clean "couldn't load" rather than a
// React crash three components deep. Kept loose on purpose: it checks the
// shape the play screen actually reads, not every field.

import { z } from "zod";
import type { RedactedView } from "@/mp/types";

const card = z.object({
  id: z.string(),
  suit: z.enum(["hearts", "diamonds", "clubs", "spades", "joker"]),
  rank: z.string(),
  isWild: z.boolean(),
});

const meld = z.object({
  id: z.string(),
  type: z.enum(["book", "run"]),
  ownerId: z.string(),
  cards: z.array(card),
  runStartIndex: z.number().optional(),
  wildCardIds: z.array(z.string()).optional(),
});

const discardEvent = z.object({ playerId: z.string(), card });

const redactedPlayer = z.object({
  seat: z.number(),
  name: z.string(),
  isAI: z.boolean(),
  difficulty: z.string().optional(),
  userId: z.string().optional(),
  handCount: z.number().nonnegative(),
  hasMeldedContract: z.boolean(),
  cumulativeScore: z.number(),
  resigned: z.boolean(),
});

export const redactedViewSchema = z
  .object({
    round: z.number(),
    roundLabel: z.string(),
    totalRounds: z.number(),
    contractRounds: z.array(z.number()),
    contract: z.object({
      books: z.number(),
      runs: z.number(),
      bookSize: z.number(),
      runSize: z.number(),
      wholeHandMeld: z.boolean(),
    }),
    players: z.array(redactedPlayer).min(2),
    yourSeat: z.number().nullable(),
    yourHand: z.array(card),
    currentSeat: z.number(),
    currentUserId: z.string().nullable(),
    yourTurn: z.boolean(),
    youHaveDrawn: z.boolean(),
    drawPileCount: z.number().nonnegative(),
    discardPile: z.array(card),
    discardTop: card.nullable(),
    melds: z.array(meld),
    discardHistory: z.array(discardEvent),
    pickupHistory: z.array(discardEvent),
    roundOver: z.boolean(),
    gameOver: z.boolean(),
    winnerSeat: z.number().nullable(),
    roundResults: z.array(
      z.object({
        round: z.number(),
        label: z.string(),
        scores: z.array(
          z.object({ seat: z.number(), penalty: z.number(), cumulative: z.number() })
        ),
      })
    ),
  })
  // The server may add fields; don't reject on those.
  .passthrough();

/** Returns the view if it validates, else null (caller shows an error). */
export function parseRedactedView(v: unknown): RedactedView | null {
  const result = redactedViewSchema.safeParse(v);
  if (result.success) return v as RedactedView;
  console.error("Malformed multiplayer view from the server:", result.error.issues.slice(0, 5));
  return null;
}
