// Quick reactions between players of a multiplayer game — a fixed set of
// presets (no free text, so nothing to moderate), each shown with an emoji
// and a translated phrase (`emote.<id>` in the dictionaries). Pure: the `mp`
// Edge Function validates ids and rate limits with these; the UI renders them.

export const EMOTE_IDS = [
  "hello",
  "nice_meld",
  "your_turn",
  "oops",
  "thanks",
  "wow",
  "lucky",
  "good_game",
] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

export const EMOTE_EMOJI: Record<EmoteId, string> = {
  hello: "👋",
  nice_meld: "👏",
  your_turn: "⏰",
  oops: "😅",
  thanks: "🙏",
  wow: "😮",
  lucky: "🍀",
  good_game: "🤝",
};

export function isEmoteId(v: unknown): v is EmoteId {
  return typeof v === "string" && (EMOTE_IDS as readonly string[]).includes(v);
}

/** Minimum gap between two emotes from the same sender in the same game. */
export const EMOTE_COOLDOWN_MS = 3_000;
/** At most this many per sender per game inside the burst window. */
export const EMOTE_BURST_LIMIT = 10;
export const EMOTE_BURST_WINDOW_MS = 10 * 60_000;
/** How many emote rows to keep per game (older ones are trimmed). */
export const EMOTE_KEEP_PER_GAME = 60;
/** A push for an emote is only sent if this sender hasn't sent one to the
 * game inside this window (so a burst of reactions is one notification). */
export const EMOTE_PUSH_QUIET_MS = 30 * 60_000;

export type EmoteRateResult = { ok: true } | { ok: false; reason: "cooldown" | "burst" };

/** `recentMs`: timestamps (ms) of this sender's emotes in this game. */
export function checkEmoteRate(recentMs: number[], nowMs: number): EmoteRateResult {
  const inWindow = recentMs.filter((t) => nowMs - t < EMOTE_BURST_WINDOW_MS);
  if (inWindow.some((t) => nowMs - t < EMOTE_COOLDOWN_MS)) return { ok: false, reason: "cooldown" };
  if (inWindow.length >= EMOTE_BURST_LIMIT) return { ok: false, reason: "burst" };
  return { ok: true };
}
