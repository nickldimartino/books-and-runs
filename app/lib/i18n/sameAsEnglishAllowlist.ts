// Values that may legitimately equal the English string in some locales
// (proper nouns, loanwords/cognates, symbols). Consumed by
// dictionaries/parity.test.tsx ("looks untranslated" check).
//
// Adding an entry means a human decided the identical text is correct for
// that locale. Every entry needs a reason. Never use this to silence a
// string you simply haven't translated yet.

interface Entry {
  /** Locale ids the identical value is OK for; "*" = every locale. */
  locales: readonly string[] | "*";
  reason: string;
}

const ALL = "*" as const;

export const SAME_AS_ENGLISH_ALLOWLIST: Record<string, Entry> = {
  "privacy.processors.linkText": { locales: ALL, reason: "Vendor name (Supabase)" },
  "settings.androidChrome": { locales: ALL, reason: "Platform/browser names" },
  "settings.iosSafari": { locales: ALL, reason: "Platform/browser names" },
  "history.names.bookLabel": { locales: ["de", "zh", "pt-BR"], reason: "History page deliberately shows the English term 'Book' next to the local one" },
  "settingsPicker.signature": { locales: ["fr"], reason: "'Signature' is the same French word" },
  "card.joker": { locales: ["de", "fr"], reason: "Joker is spelled the same (uppercase card label)" },
  "settings.tab.audio": { locales: ["de", "fr", "es", "it"], reason: "'Audio' is the local word" },
  "settings.gameSpeed.normal": { locales: ["de", "es", "pt-BR"], reason: "'Normal' is the local word" },
  "settings.sound.volume": { locales: ["fr", "pt-BR", "it"], reason: "'Volume' is the local word" },
  "settings.tab.general": { locales: ["es"], reason: "'General' is the local word" },
  "settings.section.notifications": { locales: ["fr"], reason: "Same word in French" },
  "notifications.title": { locales: ["fr"], reason: "Same word in French" },
  "welcome.notifications": { locales: ["fr"], reason: "Same word in French" },
  "settings.colorblind.protanopia": { locales: ["es", "pt-BR", "it"], reason: "Medical term, same spelling" },
  "settings.colorblind.deuteranopia": { locales: ["es", "pt-BR", "it"], reason: "Medical term, same spelling" },
  "settings.colorblind.tritanopia": { locales: ["es", "pt-BR", "it"], reason: "Medical term, same spelling" },
  "shortcuts.gamepadHeading": { locales: ["de", "it"], reason: "'Gamepad' is the loanword in these languages" },
  "roundSummary.total": { locales: ["fr", "es", "pt-BR"], reason: "'Total' is the local word" },
  "common.difficulty.expert": { locales: ["fr"], reason: "'expert' is the French word" },
  "common.contact": { locales: ["fr"], reason: "'Contact' is the French word" },
  "support.description": { locales: ["fr"], reason: "'Description' is the French word" },
  "home.solo": { locales: ["de", "fr", "es", "pt-BR", "it"], reason: "'Solo' is the local word" },
  "home.clubs": { locales: ["de", "fr"], reason: "'Clubs' is the local word" },
  "clubs.title": { locales: ["de", "fr"], reason: "'Clubs' is the local word" },
  "clubs.backToClubs": { locales: ["de", "fr"], reason: "'← Clubs' is the local word" },
  "common.home": { locales: ["it"], reason: "Italian UIs use 'Home'" },
  "common.privacy": { locales: ["it"], reason: "Italian uses 'Privacy'" },
  "home.account": { locales: ["it"], reason: "Italian uses 'Account'" },
  "account.title": { locales: ["it"], reason: "Italian uses 'Account'" },
  "account.email.heading": { locales: ["ru", "it"], reason: "'Email' is the loanword" },
  "signIn.email": { locales: ["ru", "it"], reason: "'Email' is the loanword" },
  "account.password.heading": { locales: ["it"], reason: "Italian uses 'Password'" },
  "signIn.password": { locales: ["it"], reason: "Italian uses 'Password'" },
  "howToPlay.tutorial": { locales: ["es", "pt-BR", "it"], reason: "'tutorial' is the local word" },
  "notFound.eyebrow": { locales: ["es"], reason: "'Error 404' is the Spanish phrase" },
  "gameOver.xp.quest": { locales: ["de"], reason: "German gaming term 'Quest' (matches quests.* in de.ts)" },
  "quests.title": { locales: ["de"], reason: "German gaming term 'Quests'" },
  "cosmeticReq.cat.challenges": { locales: ["de"], reason: "'Challenges' is the German gaming loanword" },
  "cosmeticReq.cat.multiplayer": { locales: ["pt-BR"], reason: "'Multiplayer' is the Brazilian gaming term" },
  "tournaments.new.name": { locales: ["de"], reason: "'Name' is the German word" },
  "player.tab.badge": { locales: ["fr", "it"], reason: "'Badge' is the local word" },
  "player.tab.banner": { locales: ["de", "es", "pt-BR", "it"], reason: "'Banner' is the local word" },
  "player.tab.boutique": { locales: ["de", "fr", "es", "pt-BR", "it"], reason: "'Boutique' is the local word" },
  "player.tab.nameAndBio": { locales: ["de"], reason: "'Name & Bio' is the German UI convention" },
  "player.picture.emojiTab": { locales: ["de", "fr", "es", "pt-BR", "it"], reason: "'Emoji' is the local word" },
  "player.picture.photoTab": { locales: ["fr"], reason: "'Photo' is the French word" },
  "player.boutique.badges": { locales: ["fr"], reason: "'Badges' is the French word" },
  "player.boutique.banners": { locales: ["es", "pt-BR"], reason: "'Banners' is the local word" },
  "achievementFamily.gamesWon.title": { locales: ["de", "fr"], reason: "'Champion' is the local word" },
  "achievementFamily.meldsWithZeroWilds.title": { locales: ["de"], reason: "'Purist' is the German word" },
  "achievementFamily.mpGamesPlayed.title": { locales: ["fr", "es"], reason: "'Sociable' is the local word" },
  "achievementFamily.weeklyChallengesCompleted.title": { locales: ["fr"], reason: "'Challenger' is a French word" },
};

export function allowsSameAsEnglish(locale: string, key: string): boolean {
  const e = SAME_AS_ENGLISH_ALLOWLIST[key.replace(/\.(zero|one|two|few|many|other)$/, "")] ?? SAME_AS_ENGLISH_ALLOWLIST[key];
  return !!e && (e.locales === "*" || e.locales.includes(locale));
}

/** Keys that may be empty in some locales (a JSX-sentence "prefix"/"suffix"
 * piece the language doesn't need because of word order). */
export const EMPTY_OK: Record<string, readonly string[]> = {
  "howToPlay.choosingMeld.step2Prefix": ["ja"],
  "howToPlay.threeRuns.body1Prefix": ["ja"],
  "friends.link.addPrompt.prefix": ["ja", "ko"],
  "friends.link.already.prefix": ["ja"],
};
export function allowsEmpty(locale: string, key: string): boolean {
  return EMPTY_OK[key]?.includes(locale) ?? false;
}
