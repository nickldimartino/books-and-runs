export type ThemeId =
  | "midnight"
  | "daylight"
  | "pastel"
  | "casino"
  | "arcade"
  | "noir"
  | "sakura"
  | "ember"
  | "lagoon"
  | "sahara"
  | "aurora"
  | "jade"
  | "verdigris"
  | "alabaster"
  | "citrus"
  | "frost"
  | "meadow"
  | "coralsand"
  | "lilac"
  | "champagne";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
}

// Deliberately interleaved light/dark (10 of each) rather than grouped by
// when each was added — 5 dark then 5 light in a row reads as two solid
// blocks in the settings grid instead of a spread of options.
export const THEMES: ThemeOption[] = [
  { id: "midnight", name: "Midnight", description: "The original dark felt-table look." },
  { id: "daylight", name: "Daylight", description: "Clean and light, easy to read in bright rooms." },
  { id: "casino", name: "Casino Royale", description: "Deep red and gold, dramatic high-roller felt." },
  { id: "pastel", name: "Pastel Deck", description: "Periwinkle, coral, and mint — soft and easy on the eyes." },
  { id: "arcade", name: "Retro Arcade", description: "Neon cyan and pink on a synthwave purple table." },
  { id: "sakura", name: "Sakura", description: "Cherry-blossom pink and white with a deep crimson accent." },
  { id: "noir", name: "Film Noir", description: "Strictly black, white, and grey — an old movie's card table." },
  { id: "citrus", name: "Citrus Grove", description: "Bright blood-orange and citrus-leaf green in the sun." },
  { id: "ember", name: "Obsidian Ember", description: "Volcanic black with a molten orange-red glow." },
  { id: "frost", name: "Frost", description: "Icy pale blue-white with a crisp glacier-blue accent." },
  { id: "lagoon", name: "Coral Lagoon", description: "Deep tropical teal with a vivid coral-pink accent." },
  { id: "meadow", name: "Meadow", description: "Sage green and cream, warmed by a buttery golden accent." },
  { id: "sahara", name: "Sahara Dusk", description: "Warm desert terracotta cooling into a teal evening sky." },
  { id: "coralsand", name: "Coral Sand", description: "Sun-bleached beach sand with a coral and ocean-blue accent." },
  { id: "aurora", name: "Aurora", description: "Polar night sky glowing green, violet, and icy cyan." },
  { id: "lilac", name: "Lilac Mist", description: "Soft grey-lavender fog with a deep plum accent." },
  { id: "jade", name: "Jade Imperial", description: "Black lacquer and jade green, trimmed in imperial gold." },
  { id: "champagne", name: "Champagne", description: "Pale gold and ivory, elegant and celebratory." },
  { id: "verdigris", name: "Verdigris", description: "Weathered copper patina warmed by a polished copper glow." },
  { id: "alabaster", name: "Alabaster", description: "Strictly stone and charcoal — Film Noir's light-toned twin." },
];

export const DEFAULT_THEME: ThemeId = "midnight";

const KEY = "booksAndRuns:theme";

export function loadLocalTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(KEY);
    return THEMES.some((t) => t.id === raw) ? (raw as ThemeId) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveLocalTheme(theme: ThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable/full — theme just won't persist across visits
  }
}

export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}
