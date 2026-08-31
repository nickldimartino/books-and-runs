import { Difficulty } from "@/types";
import { shuffle } from "@/deck";

/**
 * Cosmetic identity for an AI opponent — a name, a small avatar glyph, and a
 * one-line personality blurb, all baked into a single display string (see
 * pickAiPersonas) rather than threaded through PlayerConfig/Player as
 * separate fields. That keeps this purely a New Game–time presentation
 * choice: gameEngine.ts, recordGameResult.ts, achievements, and the
 * leaderboard all already treat a player's name as an opaque string, so
 * "🦉 Hedda" flows through every one of them for free, with nothing
 * downstream needing to know personas exist at all.
 */
export interface AiPersona {
  name: string;
  avatar: string;
  blurb: string;
}

/**
 * Three personas per difficulty, picked (not generated) so each one reads as
 * a deliberate character rather than a random name generator's output — the
 * blurb's tone escalates with the difficulty, same as the AI's own actual
 * play does. Animal avatars are a deliberate, low-effort choice: playful and
 * legible at a glance, with no cultural or gendered baggage a human
 * portrait would carry.
 */
export const AI_PERSONAS: Record<Difficulty, AiPersona[]> = {
  beginner: [
    { name: "Pip", avatar: "🐣", blurb: "Still learning the difference between a book and a run." },
    { name: "Nutmeg", avatar: "🐹", blurb: "Plays it safe and hopes for the best." },
    { name: "Barnaby", avatar: "🐢", blurb: "Takes their time — sometimes too much of it." },
  ],
  easy: [
    { name: "Clover", avatar: "🐰", blurb: "Knows the rules, still working on the strategy." },
    { name: "Quill", avatar: "🦔", blurb: "Cautious, but starting to take real risks." },
    { name: "Hazel", avatar: "🐿️", blurb: "Quick to meld, slow to plan ahead." },
  ],
  medium: [
    { name: "Hedda", avatar: "🦉", blurb: "Reads the discard pile like a book." },
    { name: "Reynard", avatar: "🦊", blurb: "Always angling for the next lay-off." },
    { name: "Talon", avatar: "🐺", blurb: "Plays it straight, no wasted moves." },
  ],
  hard: [
    { name: "Corvina", avatar: "🦅", blurb: "Rarely discards anything useful." },
    { name: "Zara", avatar: "🐆", blurb: "Fast, sharp, and not particularly forgiving." },
    { name: "Idris", avatar: "🦂", blurb: "Counts cards better than you'd like." },
  ],
  expert: [
    { name: "Vesper", avatar: "🐍", blurb: "Every discard is a trap." },
    { name: "Magnus", avatar: "🦁", blurb: "Plays for the whole game, not just the round." },
    { name: "Nyra", avatar: "🕷️", blurb: "Ruthlessly efficient. Good luck." },
  ],
};

/** The fixed rivals for Daily Deal (see dailyDealStore.ts) — deliberately
 * NOT randomized like a normal game's opponents (see pickAiPersonas): the
 * whole point of a daily challenge is comparing today's result against your
 * own history, so the table needs to stay the exact same every day rather
 * than reshuffling like a regular New Game would. Two, not one — Daily Deal
 * is never a 2-player game (see dailyDealStore.ts's own doc). */
export const DAILY_DEAL_PERSONAS: AiPersona[] = [AI_PERSONAS.medium[0], AI_PERSONAS.medium[1]];

/**
 * A cosmetic "power level" per difficulty — pure flavor, not derived from
 * any AI's actual play the way a real account's level is (see
 * leveling.ts's xpForLevel/levelForXp) — but deliberately chosen to sit
 * plausibly on that same curve: Level 50 there means roughly 125,000
 * lifetime XP, the kind of total only a genuinely dedicated player would
 * ever reach, which is exactly the read an Expert opponent should give at a
 * glance. Shown next to an AI's name the same place a signed-in account's
 * own real level already shows (see game/page.tsx's score list).
 */
export const AI_THEORETICAL_LEVEL: Record<Difficulty, number> = {
  beginner: 1,
  easy: 5,
  medium: 15,
  hard: 30,
  expert: 50,
};

function personaKey(p: AiPersona): string {
  return `${p.avatar} ${p.name}`;
}

/** Roman-enough numeral for a persona reused a 2nd/3rd/... time in one game
 * (only reachable with 4+ AIs at the same difficulty, since each pool has 3
 * names) — plain digits would read like part of the name itself ("Hedda 2"
 * looks like a typo), a numeral suffix reads as deliberately "the next one". */
function ordinalSuffix(n: number): string {
  const numerals = ["", "II", "III", "IV", "V", "VI", "VII"];
  return numerals[n - 1] ?? `${n}`;
}

/**
 * One persona per requested difficulty, in order, each one a real
 * "{avatar} {name}" display string ready to use as a Player's name —
 * shuffled per game (see the Q&A this was scoped from: a small pool,
 * randomized each game, not one fixed persona per difficulty) so the same
 * difficulty doesn't stare back with the exact same face every time. Avoids
 * handing out the same persona twice within one game — two AIs both named
 * "Hedda" at the same table would be genuinely confusing — falling back to
 * a numbered repeat only once a difficulty's own pool of 3 is exhausted,
 * which only happens with 4+ AIs sharing a difficulty.
 */
export function pickAiPersonas(difficulties: Difficulty[]): { displayName: string; blurb: string }[] {
  const used = new Map<string, number>();
  // A fresh shuffled queue per difficulty, so repeated calls into the same
  // difficulty's pool exhaust it in a random (but non-repeating) order
  // before ever falling back to a repeat.
  const queues = new Map<Difficulty, AiPersona[]>();

  return difficulties.map((difficulty) => {
    let queue = queues.get(difficulty);
    if (!queue || queue.length === 0) {
      queue = shuffle(AI_PERSONAS[difficulty]);
      queues.set(difficulty, queue);
    }
    // Prefer whichever queued persona hasn't been used yet anywhere in this
    // game (not just this difficulty) — falls back to the first still-queued
    // one once every persona everywhere has already been claimed.
    const idx = queue.findIndex((p) => !used.has(personaKey(p)));
    const chosen = queue.splice(idx === -1 ? 0 : idx, 1)[0];
    const key = personaKey(chosen);
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    const suffix = count > 1 ? ` ${ordinalSuffix(count)}` : "";
    return { displayName: `${chosen.avatar} ${chosen.name}${suffix}`, blurb: chosen.blurb };
  });
}

// One shared lookup, built once at module load, so game/page.tsx can look up
// a persona's blurb from a player's display name alone (a plain string is
// all Player.name ever carries — see this file's own top comment) without
// needing pickAiPersonas' own bookkeeping. Keyed on "{avatar} {name}" with
// no ordinal suffix — a "Hedda II" from a big table still maps back to the
// same blurb as the first Hedda, which is exactly right, since it's the same
// character reused, not a different one.
const BLURB_BY_DISPLAY = new Map<string, string>();
for (const personas of Object.values(AI_PERSONAS)) {
  for (const p of personas) BLURB_BY_DISPLAY.set(personaKey(p), p.blurb);
}

/** Looks up a persona's blurb from a player's display name (e.g. "🦉 Hedda"
 * or "🦉 Hedda II") — undefined for anything that isn't a persona name at
 * all (a human's own name, or an older game recorded before personas
 * existed), which callers should treat as "nothing to show", not an error. */
export function personaBlurbFor(displayName: string): string | undefined {
  const withoutOrdinal = displayName.replace(/ (?:II|III|IV|V|VI|VII)$/, "");
  return BLURB_BY_DISPLAY.get(withoutOrdinal);
}
