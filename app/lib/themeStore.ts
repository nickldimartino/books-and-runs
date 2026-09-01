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
