export type ThemeId = "midnight" | "daylight" | "pastel" | "casino" | "arcade";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
}

export const THEMES: ThemeOption[] = [
  { id: "midnight", name: "Midnight", description: "The original dark felt-table look." },
  { id: "daylight", name: "Daylight", description: "Clean and light, easy to read in bright rooms." },
  { id: "pastel", name: "Pastel Deck", description: "Sage, powder blue, and marigold — soft and easy on the eyes." },
  { id: "casino", name: "Casino Royale", description: "Deep red and gold, dramatic high-roller felt." },
  { id: "arcade", name: "Retro Arcade", description: "Neon cyan and pink on a synthwave purple table." },
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
