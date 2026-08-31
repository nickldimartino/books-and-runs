import { ThemeId } from "../lib/themeStore";

// Small static preview swatches per theme — kept in sync by hand with
// globals.css's [data-theme] blocks since these render outside the current
// page's own theme context (so a picker, or a compact "currently" preview,
// can show any option regardless of whichever one happens to be active
// right now). Shared by SwatchPicker (the full Theme/Card back grids) and
// the main Settings page (the compact "current selection" row for each).
export const THEME_SWATCHES: Record<ThemeId, { bg: string; panel: string; accent: string; heading: string }> = {
  midnight: { bg: "#0a2b20", panel: "#123c2c", accent: "#fbbf24", heading: "#fef3c7" },
  daylight: { bg: "#f4f1ea", panel: "#ffffff", accent: "#d97706", heading: "#1f3d2e" },
  pastel: { bg: "#eef1fb", panel: "#ffffff", accent: "#ef8b6b", heading: "#3c5e82" },
  casino: { bg: "#170a0a", panel: "#2b1010", accent: "#d4af37", heading: "#e9c46a" },
  arcade: { bg: "#14092b", panel: "#1f1147", accent: "#33e6c9", heading: "#ff5fb0" },
  noir: { bg: "#0d0d0d", panel: "#1c1c1c", accent: "#e8e8e8", heading: "#f5f5f5" },
  sakura: { bg: "#fdf1f5", panel: "#ffffff", accent: "#d63868", heading: "#7a2142" },
  ember: { bg: "#0f0906", panel: "#1e120a", accent: "#ff5a1f", heading: "#ff9552" },
  lagoon: { bg: "#04211f", panel: "#0a3634", accent: "#ff6f91", heading: "#ffe3ec" },
  sahara: { bg: "#2a1810", panel: "#3d2517", accent: "#2fb6a8", heading: "#f4c78a" },
  aurora: { bg: "#060b14", panel: "#0f1d2e", accent: "#c084fc", heading: "#86efac" },
  jade: { bg: "#0b1210", panel: "#132019", accent: "#2fae72", heading: "#f0d78c" },
  verdigris: { bg: "#0c1613", panel: "#16241f", accent: "#d97b45", heading: "#8fd4bd" },
  alabaster: { bg: "#f2f1ef", panel: "#ffffff", accent: "#2b2a27", heading: "#2b2a27" },
  citrus: { bg: "#fff8ee", panel: "#ffffff", accent: "#f2711d", heading: "#7a3b12" },
  frost: { bg: "#f4f9fc", panel: "#ffffff", accent: "#2ba7d9", heading: "#0f3a5f" },
  meadow: { bg: "#f9f8ec", panel: "#ffffff", accent: "#d6a419", heading: "#2f4a1e" },
  coralsand: { bg: "#fdf3e7", panel: "#ffffff", accent: "#ff7a5c", heading: "#8a4a1e" },
  lilac: { bg: "#f4f1f6", panel: "#ffffff", accent: "#8654a3", heading: "#4a2c5e" },
  champagne: { bg: "#faf3e4", panel: "#ffffff", accent: "#c9972f", heading: "#6b4f12" },
  valentines: { bg: "#2b0a14", panel: "#3d1220", accent: "#e0245e", heading: "#ff8fab" },
  stpatricks: { bg: "#052e16", panel: "#0c3f1f", accent: "#2fbf6f", heading: "#ffd93d" },
  easter: { bg: "#fdf6fb", panel: "#ffffff", accent: "#6fb88a", heading: "#7a3d70" },
  july4th: { bg: "#050e2e", panel: "#0d1a44", accent: "#d9263a", heading: "#ffffff" },
  halloween: { bg: "#0d0710", panel: "#1c1020", accent: "#9d5cff", heading: "#ff8c1a" },
  thanksgiving: { bg: "#2a1608", panel: "#3d2410", accent: "#c1541f", heading: "#e08a2e" },
  hanukkah: { bg: "#0a1230", panel: "#121c42", accent: "#d4af37", heading: "#e8ecff" },
  christmas: { bg: "#0a2818", panel: "#123821", accent: "#c8102e", heading: "#f4c95d" },
  newyears: { bg: "#0a0a0c", panel: "#18161c", accent: "#d4af37", heading: "#f0d78c" },
  sweetheart: { bg: "#fff0f4", panel: "#ffffff", accent: "#e0245e", heading: "#a8154a" },
  cloverfield: { bg: "#f3fbf3", panel: "#ffffff", accent: "#2fa864", heading: "#0d5c30" },
  springdusk: { bg: "#1c1030", panel: "#281848", accent: "#7fd9a8", heading: "#d8b8f0" },
  starsandstripes: { bg: "#f7f9fd", panel: "#ffffff", accent: "#c8102e", heading: "#16255e" },
  candycorn: { bg: "#fff8ec", panel: "#ffffff", accent: "#8b3fd9", heading: "#7a3d0f" },
  pumpkinspice: { bg: "#fbf0e0", panel: "#ffffff", accent: "#d2691e", heading: "#7a3d0f" },
  festivaloflights: { bg: "#f2f6ff", panel: "#ffffff", accent: "#c9972f", heading: "#1a3a7a" },
  candycane: { bg: "#fef7f5", panel: "#ffffff", accent: "#d2122e", heading: "#0d5c34" },
  confetti: { bg: "#fffaf0", panel: "#ffffff", accent: "#d94f9e", heading: "#8a6510" },
};
