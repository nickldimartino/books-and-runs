// The table themes (38 of them) and how they're applied. A theme is just a
// `[data-theme]` value on <html> — the actual colours are CSS custom
// properties defined per-theme in globals.css. `applyTheme` sets the
// attribute directly (instant, no React re-render) and keeps the
// <meta name="theme-color"> tag in step; layout.tsx re-applies the saved
// choice before first paint so there's no flash. Persisted in localStorage.

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

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
  | "champagne"
  | "valentines"
  | "sweetheart"
  | "stpatricks"
  | "cloverfield"
  | "easter"
  | "springdusk"
  | "july4th"
  | "starsandstripes"
  | "halloween"
  | "candycorn"
  | "thanksgiving"
  | "pumpkinspice"
  | "hanukkah"
  | "festivaloflights"
  | "christmas"
  | "candycane"
  | "newyears"
  | "confetti";

export type ThemeCategory = "classic" | "holiday";

export interface ThemeOption {
  id: ThemeId;
  name: string;
  description: string;
  category: ThemeCategory;
}

export const THEMES: ThemeOption[] = [
  { id: "midnight", name: "Midnight", description: "The original dark felt-table look.", category: "classic" },
  { id: "daylight", name: "Daylight", description: "Clean and light, easy to read in bright rooms.", category: "classic" },
  { id: "casino", name: "Casino Royale", description: "Deep red and gold, dramatic high-roller felt.", category: "classic" },
  { id: "pastel", name: "Pastel Deck", description: "Periwinkle, coral, and mint — soft and easy on the eyes.", category: "classic" },
  { id: "arcade", name: "Retro Arcade", description: "Neon cyan and pink on a synthwave purple table.", category: "classic" },
  { id: "sakura", name: "Sakura", description: "Cherry-blossom pink and white with a deep crimson accent.", category: "classic" },
  { id: "noir", name: "Film Noir", description: "Strictly black, white, and grey — an old movie's card table.", category: "classic" },
  { id: "citrus", name: "Citrus Grove", description: "Bright blood-orange and citrus-leaf green in the sun.", category: "classic" },
  { id: "ember", name: "Obsidian Ember", description: "Volcanic black with a molten orange-red glow.", category: "classic" },
  { id: "frost", name: "Frost", description: "Icy pale blue-white with a crisp glacier-blue accent.", category: "classic" },
  { id: "lagoon", name: "Coral Lagoon", description: "Deep tropical teal with a vivid coral-pink accent.", category: "classic" },
  { id: "meadow", name: "Meadow", description: "Sage green and cream, warmed by a buttery golden accent.", category: "classic" },
  { id: "sahara", name: "Sahara Dusk", description: "Warm desert terracotta cooling into a teal evening sky.", category: "classic" },
  { id: "coralsand", name: "Coral Sand", description: "Sun-bleached beach sand with a coral and ocean-blue accent.", category: "classic" },
  { id: "aurora", name: "Aurora", description: "Polar night sky glowing green, violet, and icy cyan.", category: "classic" },
  { id: "lilac", name: "Lilac Mist", description: "Soft grey-lavender fog with a deep plum accent.", category: "classic" },
  { id: "jade", name: "Jade Imperial", description: "Black lacquer and jade green, trimmed in imperial gold.", category: "classic" },
  { id: "champagne", name: "Champagne", description: "Pale gold and ivory, elegant and celebratory.", category: "classic" },
  { id: "verdigris", name: "Verdigris", description: "Weathered copper patina warmed by a polished copper glow.", category: "classic" },
  { id: "alabaster", name: "Alabaster", description: "Strictly stone and charcoal — Film Noir's light-toned twin.", category: "classic" },

  // Holiday themes, ordered by where they fall on the calendar — each
  // holiday's dark version comes first, then its light version, same
  // convention as every other pair here. Spring Dusk (dark) and Easter
  // (light) used to be listed in the opposite order — the one pair that
  // broke the pattern once Settings' theme picker started laying every
  // pair out left-to-right in a grid.
  { id: "valentines", name: "Valentine's Day", description: "Romantic rose-red and deep burgundy.", category: "holiday" },
  { id: "sweetheart", name: "Sweetheart", description: "Blush pink and white, like a valentine card.", category: "holiday" },
  { id: "stpatricks", name: "St. Patrick's Day", description: "Shamrock green and gold, with a touch of Irish orange.", category: "holiday" },
  { id: "cloverfield", name: "Clover Field", description: "Pale mint and cream, with a bright shamrock-green accent.", category: "holiday" },
  { id: "springdusk", name: "Spring Dusk", description: "Twilight plum with pastel mint and lavender popping through.", category: "holiday" },
  { id: "easter", name: "Easter", description: "Pastel lavender, spring mint, and jellybean yellow.", category: "holiday" },
  { id: "july4th", name: "4th of July", description: "Fireworks over a midnight-blue sky, red, white, and blue.", category: "holiday" },
  { id: "starsandstripes", name: "Stars & Stripes", description: "Crisp daytime red, white, and blue — a backyard cookout.", category: "holiday" },
  { id: "halloween", name: "Halloween", description: "Witchy purple and jack-o'-lantern orange after dark.", category: "holiday" },
  { id: "candycorn", name: "Candy Corn", description: "Cream and pumpkin orange with a playful purple accent.", category: "holiday" },
  { id: "thanksgiving", name: "Thanksgiving", description: "Harvest brown and pumpkin orange, warm and cozy.", category: "holiday" },
  { id: "pumpkinspice", name: "Pumpkin Spice", description: "Warm cream and cinnamon brown with a pumpkin-orange accent.", category: "holiday" },
  { id: "hanukkah", name: "Hanukkah", description: "Royal blue and silver, lit by menorah gold.", category: "holiday" },
  { id: "festivaloflights", name: "Festival of Lights", description: "Pale ice-blue and white, lit by menorah gold.", category: "holiday" },
  { id: "christmas", name: "Christmas", description: "Pine green and holly red, trimmed in gold.", category: "holiday" },
  { id: "candycane", name: "Candy Cane", description: "Peppermint white and red, striped with pine green.", category: "holiday" },
  { id: "newyears", name: "New Year's Eve", description: "Black-tie black and champagne gold, ready for midnight.", category: "holiday" },
  { id: "confetti", name: "Confetti", description: "Bright white with a gold and confetti-pink pop.", category: "holiday" },
];

// Every theme's --bg value, duplicated by hand here rather than read via
// getComputedStyle — same trade-off THEME_SWATCHES (settings/themeSwatches.ts)
// already accepts, and for the same reason: this needs to be readable before
// the theme's own CSS custom properties are necessarily in effect (see
// layout.tsx's THEME_INIT_SCRIPT, which sets the <meta name="theme-color">
// tag before first paint) or from plain JS with no element to read styles
// off of yet. Keep in sync with globals.css's [data-theme] --bg values and
// THEME_SWATCHES.bg by hand when adding a theme.
export const THEME_BG: Record<ThemeId, string> = {
  midnight: "#0a2b20",
  daylight: "#f4f1ea",
  pastel: "#eef1fb",
  casino: "#170a0a",
  arcade: "#14092b",
  noir: "#0d0d0d",
  sakura: "#fdf1f5",
  ember: "#0f0906",
  lagoon: "#04211f",
  sahara: "#2a1810",
  aurora: "#060b14",
  jade: "#0b1210",
  verdigris: "#0c1613",
  alabaster: "#f2f1ef",
  citrus: "#fff8ee",
  frost: "#f4f9fc",
  meadow: "#f9f8ec",
  coralsand: "#fdf3e7",
  lilac: "#f4f1f6",
  champagne: "#faf3e4",
  valentines: "#2b0a14",
  stpatricks: "#052e16",
  easter: "#fdf6fb",
  july4th: "#050e2e",
  halloween: "#0d0710",
  thanksgiving: "#2a1608",
  hanukkah: "#0a1230",
  festivaloflights: "#f2f6ff",
  christmas: "#0a2818",
  newyears: "#0a0a0c",
  sweetheart: "#fff0f4",
  cloverfield: "#f3fbf3",
  springdusk: "#1c1030",
  starsandstripes: "#f7f9fd",
  candycorn: "#fff8ec",
  pumpkinspice: "#fbf0e0",
  candycane: "#fef7f5",
  confetti: "#fffaf0",
};

/**
 * The handful of --bg/--panel/--border/--heading/--text/--muted/--accent/
 * --accent-hover/--on-accent values every theme defines, duplicated by hand
 * here for the same reason THEME_BG above is: app/global-error.tsx has to
 * bring its own <html>/<body> (the root layout — and so globals.css's
 * [data-theme] rules — never mounts when it's showing), so it can't read
 * these off a CSS custom property the way every themed component in the app
 * normally does. Keep in sync with globals.css's [data-theme] blocks by hand
 * when adding or re-coloring a theme.
 */
export interface ThemeErrorColors {
  bg: string;
  panel: string;
  border: string;
  heading: string;
  text: string;
  muted: string;
  accent: string;
  accentHover: string;
  onAccent: string;
}

export const THEME_ERROR_COLORS: Record<ThemeId, ThemeErrorColors> = {
  midnight: { bg: "#0a2b20", panel: "#123c2c", border: "rgba(209, 250, 229, 0.15)", heading: "#fef3c7", text: "#f5f0e6", muted: "rgba(209, 250, 229, 0.78)", accent: "#fbbf24", accentHover: "#fcd34d", onAccent: "#022c22" },
  daylight: { bg: "#f4f1ea", panel: "#ffffff", border: "rgba(30, 41, 26, 0.12)", heading: "#1f3d2e", text: "#24291f", muted: "rgba(36, 41, 31, 0.72)", accent: "#a85708", accentHover: "#8a4708", onAccent: "#fffaf0" },
  pastel: { bg: "#eef1fb", panel: "#ffffff", border: "rgba(58, 66, 110, 0.16)", heading: "#3c5e82", text: "#34314a", muted: "rgba(52, 49, 74, 0.68)", accent: "#ef8b6b", accentHover: "#e97a54", onAccent: "#3d1806" },
  casino: { bg: "#170a0a", panel: "#2b1010", border: "rgba(230, 200, 140, 0.18)", heading: "#e9c46a", text: "#f2e8d8", muted: "rgba(242, 232, 216, 0.72)", accent: "#d4af37", accentHover: "#e6c65c", onAccent: "#1a0e02" },
  arcade: { bg: "#14092b", panel: "#1f1147", border: "rgba(255, 255, 255, 0.14)", heading: "#ff5fb0", text: "#ece6ff", muted: "rgba(236, 230, 255, 0.72)", accent: "#33e6c9", accentHover: "#5cf0d8", onAccent: "#0c1220" },
  noir: { bg: "#0d0d0d", panel: "#1c1c1c", border: "rgba(255, 255, 255, 0.16)", heading: "#f5f5f5", text: "#e8e8e8", muted: "rgba(232, 232, 232, 0.72)", accent: "#e8e8e8", accentHover: "#ffffff", onAccent: "#0d0d0d" },
  sakura: { bg: "#fdf1f5", panel: "#ffffff", border: "rgba(107, 33, 55, 0.14)", heading: "#7a2142", text: "#4a2233", muted: "rgba(74, 34, 51, 0.68)", accent: "#d63868", accentHover: "#c22a58", onAccent: "#fff5f8" },
  ember: { bg: "#0f0906", panel: "#1e120a", border: "rgba(255, 158, 87, 0.18)", heading: "#ff9552", text: "#f5e6d8", muted: "rgba(245, 230, 216, 0.72)", accent: "#ff5a1f", accentHover: "#ff7a45", onAccent: "#1a0800" },
  lagoon: { bg: "#04211f", panel: "#0a3634", border: "rgba(255, 214, 224, 0.16)", heading: "#ffe3ec", text: "#e3f6f2", muted: "rgba(227, 246, 242, 0.72)", accent: "#ff6f91", accentHover: "#ff8aa8", onAccent: "#2b0410" },
  sahara: { bg: "#2a1810", panel: "#3d2517", border: "rgba(255, 214, 165, 0.16)", heading: "#f4c78a", text: "#f2e4d3", muted: "rgba(242, 228, 211, 0.72)", accent: "#2fb6a8", accentHover: "#45cabc", onAccent: "#04211d" },
  aurora: { bg: "#060b14", panel: "#0f1d2e", border: "rgba(103, 232, 249, 0.16)", heading: "#86efac", text: "#e0f2f7", muted: "rgba(224, 242, 247, 0.72)", accent: "#c084fc", accentHover: "#d8b4fe", onAccent: "#1e0a2e" },
  jade: { bg: "#0b1210", panel: "#132019", border: "rgba(212, 175, 55, 0.18)", heading: "#f0d78c", text: "#eaf3ec", muted: "rgba(234, 243, 236, 0.72)", accent: "#2fae72", accentHover: "#3fc588", onAccent: "#04140c" },
  verdigris: { bg: "#0c1613", panel: "#16241f", border: "rgba(212, 149, 96, 0.18)", heading: "#8fd4bd", text: "#e9f2ee", muted: "rgba(233, 242, 238, 0.72)", accent: "#d97b45", accentHover: "#e8935f", onAccent: "#2a0f02" },
  alabaster: { bg: "#f2f1ef", panel: "#ffffff", border: "rgba(30, 30, 28, 0.14)", heading: "#2b2a27", text: "#333230", muted: "rgba(51, 50, 48, 0.68)", accent: "#2b2a27", accentHover: "#3d3b37", onAccent: "#f2f1ef" },
  citrus: { bg: "#fff8ee", panel: "#ffffff", border: "rgba(120, 53, 15, 0.14)", heading: "#7a3b12", text: "#3d2611", muted: "rgba(61, 38, 17, 0.7)", accent: "#f2711d", accentHover: "#ff8a3d", onAccent: "#2a0d00" },
  frost: { bg: "#f4f9fc", panel: "#ffffff", border: "rgba(15, 52, 79, 0.14)", heading: "#0f3a5f", text: "#16324a", muted: "rgba(22, 50, 74, 0.68)", accent: "#2ba7d9", accentHover: "#45bcec", onAccent: "#f0fbff" },
  meadow: { bg: "#f9f8ec", panel: "#ffffff", border: "rgba(45, 74, 30, 0.14)", heading: "#2f4a1e", text: "#33341c", muted: "rgba(51, 52, 28, 0.68)", accent: "#d6a419", accentHover: "#e8b62f", onAccent: "#2a1c00" },
  coralsand: { bg: "#fdf3e7", panel: "#ffffff", border: "rgba(120, 65, 20, 0.14)", heading: "#8a4a1e", text: "#4a3420", muted: "rgba(74, 52, 32, 0.68)", accent: "#ff7a5c", accentHover: "#ff9276", onAccent: "#2a0800" },
  lilac: { bg: "#f4f1f6", panel: "#ffffff", border: "rgba(70, 40, 90, 0.14)", heading: "#4a2c5e", text: "#362640", muted: "rgba(54, 38, 64, 0.68)", accent: "#8654a3", accentHover: "#9968b8", onAccent: "#fbf7fd" },
  champagne: { bg: "#faf3e4", panel: "#ffffff", border: "rgba(120, 90, 20, 0.14)", heading: "#6b4f12", text: "#3d2f14", muted: "rgba(61, 47, 20, 0.68)", accent: "#c9972f", accentHover: "#ddab48", onAccent: "#2a1c00" },
  valentines: { bg: "#2b0a14", panel: "#3d1220", border: "rgba(255, 182, 200, 0.18)", heading: "#ff8fab", text: "#f5e4ea", muted: "rgba(245, 228, 234, 0.72)", accent: "#e0245e", accentHover: "#f0407a", onAccent: "#fff0f4" },
  sweetheart: { bg: "#fff0f4", panel: "#ffffff", border: "rgba(180, 20, 70, 0.14)", heading: "#a8154a", text: "#4a1428", muted: "rgba(74, 20, 40, 0.68)", accent: "#e0245e", accentHover: "#f0407a", onAccent: "#fff0f4" },
  stpatricks: { bg: "#052e16", panel: "#0c3f1f", border: "rgba(255, 215, 130, 0.16)", heading: "#ffd93d", text: "#eafaf0", muted: "rgba(234, 250, 240, 0.72)", accent: "#2fbf6f", accentHover: "#45d685", onAccent: "#04140a" },
  cloverfield: { bg: "#f3fbf3", panel: "#ffffff", border: "rgba(10, 90, 40, 0.14)", heading: "#0d5c30", text: "#143a20", muted: "rgba(20, 58, 32, 0.68)", accent: "#2fa864", accentHover: "#3fc078", onAccent: "#04140a" },
  easter: { bg: "#fdf6fb", panel: "#ffffff", border: "rgba(120, 60, 110, 0.14)", heading: "#7a3d70", text: "#4a2e46", muted: "rgba(74, 46, 70, 0.68)", accent: "#6fb88a", accentHover: "#85cc9e", onAccent: "#0a2214" },
  springdusk: { bg: "#1c1030", panel: "#281848", border: "rgba(200, 170, 255, 0.16)", heading: "#d8b8f0", text: "#ede4f5", muted: "rgba(237, 228, 245, 0.72)", accent: "#7fd9a8", accentHover: "#98e6bc", onAccent: "#0a2214" },
  july4th: { bg: "#050e2e", panel: "#0d1a44", border: "rgba(255, 255, 255, 0.16)", heading: "#ffffff", text: "#f0f2fa", muted: "rgba(240, 242, 250, 0.72)", accent: "#d9263a", accentHover: "#ec4256", onAccent: "#fff5f5" },
  starsandstripes: { bg: "#f7f9fd", panel: "#ffffff", border: "rgba(20, 40, 100, 0.14)", heading: "#16255e", text: "#14203f", muted: "rgba(20, 32, 63, 0.68)", accent: "#c8102e", accentHover: "#dc3048", onAccent: "#fff5f5" },
  halloween: { bg: "#0d0710", panel: "#1c1020", border: "rgba(157, 92, 255, 0.18)", heading: "#ff8c1a", text: "#f0e6f5", muted: "rgba(240, 230, 245, 0.72)", accent: "#9d5cff", accentHover: "#b47dff", onAccent: "#150a20" },
  candycorn: { bg: "#fff8ec", panel: "#ffffff", border: "rgba(120, 60, 180, 0.16)", heading: "#7a3d0f", text: "#4a2e0a", muted: "rgba(74, 46, 10, 0.68)", accent: "#8b3fd9", accentHover: "#a05de6", onAccent: "#fbf5ff" },
  thanksgiving: { bg: "#2a1608", panel: "#3d2410", border: "rgba(230, 150, 60, 0.18)", heading: "#e08a2e", text: "#f2e4d3", muted: "rgba(242, 228, 211, 0.72)", accent: "#c1541f", accentHover: "#d76b32", onAccent: "#2a0d00" },
  pumpkinspice: { bg: "#fbf0e0", panel: "#ffffff", border: "rgba(120, 65, 20, 0.16)", heading: "#7a3d0f", text: "#4a3018", muted: "rgba(74, 48, 24, 0.68)", accent: "#d2691e", accentHover: "#e07d36", onAccent: "#2a0d00" },
  hanukkah: { bg: "#0a1230", panel: "#121c42", border: "rgba(200, 210, 255, 0.16)", heading: "#e8ecff", text: "#eef0fa", muted: "rgba(238, 240, 250, 0.72)", accent: "#d4af37", accentHover: "#e6c65c", onAccent: "#1a1400" },
  festivaloflights: { bg: "#f2f6ff", panel: "#ffffff", border: "rgba(30, 50, 120, 0.14)", heading: "#1a3a7a", text: "#16224a", muted: "rgba(22, 34, 74, 0.68)", accent: "#c9972f", accentHover: "#ddab48", onAccent: "#2a1c00" },
  christmas: { bg: "#0a2818", panel: "#123821", border: "rgba(255, 215, 200, 0.16)", heading: "#f4c95d", text: "#f0ede3", muted: "rgba(240, 237, 227, 0.72)", accent: "#c8102e", accentHover: "#e0304a", onAccent: "#fff5f5" },
  candycane: { bg: "#fef7f5", panel: "#ffffff", border: "rgba(180, 20, 40, 0.14)", heading: "#0d5c34", text: "#3a1418", muted: "rgba(58, 20, 24, 0.68)", accent: "#d2122e", accentHover: "#e8324a", onAccent: "#fff5f5" },
  newyears: { bg: "#0a0a0c", panel: "#18161c", border: "rgba(230, 200, 120, 0.2)", heading: "#f0d78c", text: "#f0eef2", muted: "rgba(240, 238, 242, 0.72)", accent: "#d4af37", accentHover: "#e6c65c", onAccent: "#1a1400" },
  confetti: { bg: "#fffaf0", panel: "#ffffff", border: "rgba(150, 110, 20, 0.16)", heading: "#8a6510", text: "#3a2e10", muted: "rgba(58, 46, 16, 0.68)", accent: "#d94f9e", accentHover: "#e56db3", onAccent: "#2a0a1c" },
};

export const DEFAULT_THEME: ThemeId = "midnight";

const KEY = "booksAndRuns:theme";

export function loadLocalTheme(): ThemeId {
  const raw = readLocalStorage(KEY);
  return THEMES.some((t) => t.id === raw) ? (raw as ThemeId) : DEFAULT_THEME;
}

export function saveLocalTheme(theme: ThemeId): void {
  writeLocalStorage(KEY, theme);
}

export function applyTheme(theme: ThemeId): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  // Keeps Safari's status-bar/tab-bar tint in sync with whatever's actually
  // on screen — without an explicit <meta name="theme-color">, iOS Safari's
  // own auto-tint heuristic doesn't reliably read this page's --bg (the
  // safe-area strip stayed a stale dark color even on light themes),
  // instead of matching. The tag itself is rendered by layout.tsx's
  // `viewport.themeColor` (defaulting to DEFAULT_THEME) and kept current on
  // every subsequent full page load by THEME_INIT_SCRIPT there — this just
  // covers the same switch happening live, without a reload, from the theme
  // picker.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_BG[theme]);
}
