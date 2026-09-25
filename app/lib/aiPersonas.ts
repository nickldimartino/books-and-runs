import { Difficulty } from "@/types";
import { shuffle } from "@/deck";
import type { TranslationKey } from "./i18n/keys";
import type { Vars } from "./i18n/LocaleProvider";

type T = (key: TranslationKey, vars?: Vars) => string;

/**
 * Cosmetic identity for an AI opponent — a name, a small avatar glyph, and a
 * one-line personality blurb, all baked into a single display string (see
 * pickAiPersonas) rather than threaded through PlayerConfig/Player as
 * separate fields. That keeps this purely a New Game–time presentation
 * choice: gameEngine.ts, recordGameResult.ts, achievements, and the
 * leaderboard all already treat a player's name as an opaque string, so
 * "🦉 Hedda" flows through every one of them for free, with nothing
 * downstream needing to know personas exist at all.
 *
 * `name`/`avatar` stay untranslated proper nouns (a persona's identity, not
 * a sentence — same treatment as cosmetic item names elsewhere in this
 * app); `blurbKey` points at the translated flavor line, resolved at
 * render time by personaBlurbFor(name, t) rather than baked in here.
 */
interface AiPersona {
  name: string;
  avatar: string;
  blurbKey: TranslationKey;
}

/**
 * Seven personas per difficulty, picked (not generated) so each one reads as
 * a deliberate character rather than a random name generator's output — the
 * blurb's tone escalates with the difficulty, same as the AI's own actual
 * play does. Animal avatars are a deliberate, low-effort choice: playful and
 * legible at a glance, with no cultural or gendered baggage a human
 * portrait would carry.
 *
 * Seven, specifically, is the most AIs a single game can seat at one
 * difficulty — New Game caps a table at 8 players (MAX_PLAYERS) with at
 * least one human — so a full roster of one difficulty now always draws a
 * distinct name for every seat (see pickAiPersonas), with no numbered
 * "Hedda II" repeats. Keep all five pools the same length: pickAiPersonas
 * assumes it can always fill a same-difficulty table from that difficulty's
 * own pool alone.
 */
export const AI_PERSONAS: Record<Difficulty, AiPersona[]> = {
  beginner: [
    { name: "Pip", avatar: "🐣", blurbKey: "aiPersona.pip" },
    { name: "Nutmeg", avatar: "🐹", blurbKey: "aiPersona.nutmeg" },
    { name: "Barnaby", avatar: "🐢", blurbKey: "aiPersona.barnaby" },
    { name: "Dabble", avatar: "🦆", blurbKey: "aiPersona.dabble" },
    { name: "Bumble", avatar: "🐸", blurbKey: "aiPersona.bumble" },
    { name: "Doodle", avatar: "🐛", blurbKey: "aiPersona.doodle" },
    { name: "Waffle", avatar: "🐨", blurbKey: "aiPersona.waffle" },
  ],
  easy: [
    { name: "Clover", avatar: "🐰", blurbKey: "aiPersona.clover" },
    { name: "Quill", avatar: "🦔", blurbKey: "aiPersona.quill" },
    { name: "Hazel", avatar: "🐿️", blurbKey: "aiPersona.hazel" },
    { name: "Skipper", avatar: "🦦", blurbKey: "aiPersona.skipper" },
    { name: "Dax", avatar: "🦫", blurbKey: "aiPersona.dax" },
    { name: "Newt", avatar: "🦎", blurbKey: "aiPersona.newt" },
    { name: "Bram", avatar: "🦌", blurbKey: "aiPersona.bram" },
  ],
  medium: [
    { name: "Hedda", avatar: "🦉", blurbKey: "aiPersona.hedda" },
    { name: "Reynard", avatar: "🦊", blurbKey: "aiPersona.reynard" },
    { name: "Talon", avatar: "🐺", blurbKey: "aiPersona.talon" },
    { name: "Bandit", avatar: "🦝", blurbKey: "aiPersona.bandit" },
    { name: "Cleaver", avatar: "🐗", blurbKey: "aiPersona.cleaver" },
    { name: "Slate", avatar: "🐈‍⬛", blurbKey: "aiPersona.slate" },
    { name: "Echo", avatar: "🦇", blurbKey: "aiPersona.echo" },
  ],
  hard: [
    { name: "Corvina", avatar: "🦅", blurbKey: "aiPersona.corvina" },
    { name: "Zara", avatar: "🐆", blurbKey: "aiPersona.zara" },
    { name: "Idris", avatar: "🦂", blurbKey: "aiPersona.idris" },
    { name: "Marlow", avatar: "🦈", blurbKey: "aiPersona.marlow" },
    { name: "Kesler", avatar: "🐊", blurbKey: "aiPersona.kesler" },
    { name: "Sabre", avatar: "🐅", blurbKey: "aiPersona.sabre" },
    { name: "Vex", avatar: "🐙", blurbKey: "aiPersona.vex" },
  ],
  expert: [
    { name: "Vesper", avatar: "🐍", blurbKey: "aiPersona.vesper" },
    { name: "Magnus", avatar: "🦁", blurbKey: "aiPersona.magnus" },
    { name: "Nyra", avatar: "🕷️", blurbKey: "aiPersona.nyra" },
    { name: "Drake", avatar: "🐉", blurbKey: "aiPersona.drake" },
    { name: "Bly", avatar: "🐋", blurbKey: "aiPersona.bly" },
    { name: "Rook", avatar: "🐦‍⬛", blurbKey: "aiPersona.rook" },
    { name: "Sett", avatar: "🦡", blurbKey: "aiPersona.sett" },
  ],
};

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

/** Roman-enough numeral for a persona reused a 2nd/3rd/... time in one game.
 * Each pool now holds 7 names and a table seats at most 7 same-difficulty
 * AIs (see AI_PERSONAS' own note), so this is unreachable from New Game as
 * it stands — it's kept purely as a graceful fallback in case those limits
 * ever change. Plain digits would read like part of the name itself
 * ("Hedda 2" looks like a typo); a numeral suffix reads as deliberately
 * "the next one". */
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
 * "Hedda" at the same table would be genuinely confusing. Each pool holds 7
 * personas and a table seats at most 7 same-difficulty AIs, so a normal
 * New Game never exhausts a pool; the numbered-repeat fallback below
 * (ordinalSuffix) only ever matters if that ratio changes.
 */
export function pickAiPersonas(difficulties: Difficulty[]): { displayName: string }[] {
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
    return { displayName: `${chosen.avatar} ${chosen.name}${suffix}` };
  });
}

// One shared lookup, built once at module load, so game/page.tsx can look up
// a persona's blurb key from a player's display name alone (a plain string
// is all Player.name ever carries — see this file's own top comment)
// without needing pickAiPersonas' own bookkeeping. Keyed on "{avatar}
// {name}" with no ordinal suffix — a "Hedda II" from a big table still maps
// back to the same blurb as the first Hedda, which is exactly right, since
// it's the same character reused, not a different one.
const BLURB_KEY_BY_DISPLAY = new Map<string, TranslationKey>();
for (const personas of Object.values(AI_PERSONAS)) {
  for (const p of personas) BLURB_KEY_BY_DISPLAY.set(personaKey(p), p.blurbKey);
}

/** Looks up a persona's translated blurb from a player's display name (e.g.
 * "🦉 Hedda" or "🦉 Hedda II") — undefined for anything that isn't a
 * persona name at all (a human's own name, or an older game recorded
 * before personas existed), which callers should treat as "nothing to
 * show", not an error. */
export function personaBlurbFor(displayName: string, t: T): string | undefined {
  const withoutOrdinal = displayName.replace(/ (?:II|III|IV|V|VI|VII)$/, "");
  const key = BLURB_KEY_BY_DISPLAY.get(withoutOrdinal);
  return key ? t(key) : undefined;
}
