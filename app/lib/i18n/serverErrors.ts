// Maps the English error strings that reach the UI from places that can't
// call t() themselves — the Supabase auth SDK, the `mp` Edge Function, the
// pure engine/adapter validators in src/, and client-side stores that throw
// plain Errors — onto translated keys. Matching is case-insensitive and
// ignores trailing punctuation; a message that matches nothing is returned
// unchanged (better an English server message than a blank one).
import type { TranslationKey } from "./keys";
import type { Vars } from "./LocaleProvider";

type Translate = (key: TranslationKey, vars?: Vars) => string;

const norm = (s: string) => s.trim().replace(/[.!\s]+$/, "").toLowerCase();

const EXACT: Array<[string, TranslationKey]> = [
  ["Something went wrong", "err.generic"],
  // Guard/validation messages from the mp / delete-account Edge Functions and
  // the 0056-0064 RPCs that a normal UI path never triggers; they still map
  // to the translated generic line rather than leaking English.
  ["unknown emote", "err.generic"],
  ["invalid target", "err.generic"],
  ["no such user", "err.generic"],
  ["cannot report yourself", "err.generic"],
  ["invalid report", "err.generic"],
  ["not authenticated", "err.signedOut"],
  ["unauthorized", "err.signedOut"],
  ["confirmation required", "err.generic"],
  ["Method not allowed", "err.generic"],
  ["You can't connect with this player", "safety.err.connect"],
  ["Too many attempts — try again later", "safety.err.tooMany"],
  ["That name isn't allowed", "safety.content.name"],
  ["That bio isn't allowed", "safety.content.bio"],
  ["That name is reserved", "safety.content.reserved"],
  ["Links aren't allowed here", "safety.content.link"],
  ["Current password is incorrect", "account.error.wrongPassword"],
  ["Couldn't leave your games — try again in a moment", "account.delete.errLeave"],
  ["Couldn't delete the account — try again in a moment", "account.delete.error"],
  ["already nudged recently", "err.mp.alreadyNudged"],
  ["nothing to nudge", "err.mp.nothingToNudge"],
  ["Couldn't load the game", "err.loadGame"],
  ["Couldn't cancel this game", "err.cancelGame"],
  ["Couldn't respond to this invite", "err.respondInvite"],
  ["Couldn't start a rematch", "err.rematch"],
  ["You're signed out", "err.signedOut"],
  ["Request failed", "err.requestFailed"],
  ["Sign-in isn't configured yet", "err.signInNotConfigured"],
  ["No authenticator app is set up on this account", "err.noAuthenticator"],
  ["You haven't unlocked that yet", "err.cosmeticLocked"],
  ["That name is already taken", "err.nameTaken"],
  ["That avatar choice isn't one of the presets", "err.avatarPreset"],
  ["That badge isn't one of the presets", "err.badgePreset"],
  ["That file isn't an image", "err.avatarNotImage"],
  ["That image is too large — try one under 20 MB", "err.avatarTooLarge"],
  ["Couldn't read that image — try a different file", "err.avatarRead"],
  ["Couldn't process that image", "err.avatarProcess"],
  ["Push isn't configured on this deployment yet", "err.push.notConfigured"],
  ["Couldn't register the service worker", "err.push.serviceWorker"],
  ["Couldn't subscribe with this browser", "err.push.subscribe"],
  ["Malformed subscription", "err.push.malformed"],
  ["Couldn't save the subscription", "err.push.save"],
  ["Couldn't turn on notifications", "err.push.default"],
  ["Couldn't read the last round's line-up", "err.lastRoundLineup"],
  ["Invalid login credentials", "err.auth.invalidCredentials"],
  ["Email not confirmed", "err.auth.emailNotConfirmed"],
  ["User already registered", "err.auth.userExists"],
  ["A user with this email address has already been registered", "err.auth.userExists"],
  ["New password should be different from the old password", "err.auth.passwordSame"],
  ["Auth session missing", "err.auth.sessionMissing"],
  ["Token has expired or is invalid", "err.auth.tokenExpired"],
  ["Email link is invalid or has expired", "err.auth.tokenExpired"],
  ["Invalid TOTP code entered", "err.auth.badTotp"],
  ["Invalid MFA code", "err.auth.badTotp"],
  ["Email rate limit exceeded", "err.auth.rateLimit"],
  ["Password is known to be weak and easy to guess, please choose a different one", "err.auth.weakPassword"],
  ["Include at least one non-wild card", "err.meld.needNatural"],
  ["A meld can't use more wild cards than natural cards", "err.meld.wildLimit"],
  ["Choose which card the wild represents", "err.meld.chooseWild"],
  ["These cards don't share a rank (for a book) or a suit in sequence (for a run)", "err.meld.noShare"],
  ["pick at least one round", "err.mp.pickRound"],
  ["invite at least one friend", "err.mp.inviteOne"],
  ["a game needs 2–8 players", "err.mp.playerCount"],
  ["couldn't create the game", "err.mp.createFailed"],
  ["no such game", "err.mp.noGame"],
  ["no pending invite for you here", "err.mp.noInvite"],
  ["only the host can cancel this", "err.mp.hostOnly"],
  ["this game already started", "err.mp.alreadyStarted"],
  ["you're not in this game", "err.mp.notInGame"],
  ["this game isn't active", "err.mp.notActive"],
  ["game not ready", "err.mp.notReady"],
  ["unknown action", "err.mp.unknownAction"],
  ["the game moved on — refresh", "err.mp.movedOn"],
  ["sign in first", "err.mp.signInFirst"],
  ["unknown route", "err.mp.unknownRoute"],
  ["something went wrong", "err.mp.wentWrong"],
  ["the round is over", "err.mp.roundOver"],
  ["it isn't your turn", "err.mp.notYourTurn"],
  ["you've already drawn this turn", "err.mp.alreadyDrew"],
  ["draw a card first", "err.mp.drawFirst"],
  ["too many cards to meld at once", "err.mp.tooManyMeld"],
  ["too many lay-offs at once", "err.mp.tooManyLayoffs"],
  ["you've already melded this round", "err.mp.alreadyMelded"],
  ["that meld doesn't complete this round's contract", "err.mp.meldIncomplete"],
  ["one of those lay-offs isn't valid", "err.mp.layoffInvalid"],
  ["that lay-off isn't valid", "err.mp.layoffOne"],
  ["choose a card to discard", "err.mp.chooseDiscard"],
  ["that card isn't in your hand", "err.mp.notInHand"],
  ["choose the cards to meld", "err.mp.chooseMeldCards"],
];
const EXACT_MAP = new Map(EXACT.map(([m, k]) => [norm(m), k]));

const PATTERNS: Array<[RegExp, TranslationKey, (m: RegExpMatchArray) => Vars]> = [
  [/^A book needs at least (\d+) cards$/i, "err.meld.bookSize", (m) => ({ n: m[1] })],
  [/^A run needs at least (\d+) cards$/i, "err.meld.runSize", (m) => ({ n: m[1] })],
  [/^Password should be at least (\d+) characters/i, "err.auth.passwordShort", (m) => ({ n: m[1] })],
  [/only request this after (\d+) seconds/i, "err.auth.rateLimitSeconds", (m) => ({ n: m[1] })],
  [/^(.+) isn't in your friends list$/i, "err.mp.notFriend", (m) => ({ name: m[1] })],
  [/^(.+) already has (\d+) games going$/i, "err.mp.theirCap", (m) => ({ name: m[1], n: m[2] })],
  [/^You already have (\d+) multiplayer games going$/i, "err.mp.yourCap", (m) => ({ n: m[1] })],
  [/unable to validate email address|email address .* is invalid/i, "err.auth.invalidEmail", () => ({})],
];

/** Translated form of a known English error message, or the message itself
 * if it isn't recognized. */
export function translateError(message: string | null | undefined, t: Translate): string {
  if (!message) return "";
  const key = EXACT_MAP.get(norm(message));
  if (key) return t(key);
  for (const [re, k, vars] of PATTERNS) {
    const m = message.match(re);
    if (m) return t(k, vars(m));
  }
  return message;
}
