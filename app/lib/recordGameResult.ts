import { YOU_PLAYER_ID } from "@/types";

// Re-exported so every existing `import { YOU_PLAYER_ID } from "./lib/recordGameResult"`
// keeps working — the constant itself now lives in src/types.ts (see its
// own doc) so a Deno bundle of src/ can use it too.
export { YOU_PLAYER_ID };

// A finished game's result used to be written directly from here
// (recordGameResult, an owner-RLS write to player_stats/game_history) —
// that write is now server-verified instead (see
// supabase/functions/solo-verify/index.ts's recordMpGameOutcome-equivalent
// logic and app/lib/verifySoloGame.ts), so only the shared shape survives
// here for whatever still needs it.
export interface RoundHistoryEntry {
  round: number;
  totals: Record<string, number>;
}
