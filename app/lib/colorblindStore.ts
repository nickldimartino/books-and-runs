// A [data-colorblind] attribute on <html>, applied the same way (and for the
// same reason) as themeStore.ts's [data-theme]: setting it directly lets the
// three CSS variables it overrides (see globals.css) take effect instantly,
// with no React re-render needed anywhere card colors are used. Kept as its
// own small store, separate from settingsStore.ts's HouseSettings, so it can
// apply itself immediately on selection — like theme, and unlike the
// Save-button-gated toggles in Settings — instead of waiting for "Save
// settings".

export type ColorblindMode = "off" | "protanopia" | "deuteranopia" | "tritanopia";

export interface ColorblindOption {
  id: ColorblindMode;
  name: string;
  description: string;
}

export const COLORBLIND_MODES: ColorblindOption[] = [
  { id: "off", name: "Off", description: "Standard red/black card coloring." },
  {
    id: "protanopia",
    name: "Protanopia",
    description: "Red cards shift to blue, easier to tell apart from black for red-blind vision.",
  },
  {
    id: "deuteranopia",
    name: "Deuteranopia",
    description: "Red cards shift to a vivid orange, easier to tell apart from black for green-blind vision.",
  },
  {
    id: "tritanopia",
    name: "Tritanopia",
    description:
      "Wild cards shift from gold to magenta, easier to tell apart from red/black for blue-blind vision. Red and black cards are left unchanged — that distinction already reads fine for this type.",
  },
];

export const DEFAULT_COLORBLIND_MODE: ColorblindMode = "off";

const KEY = "booksAndRuns:colorblindMode";

export function loadLocalColorblindMode(): ColorblindMode {
  if (typeof window === "undefined") return DEFAULT_COLORBLIND_MODE;
  try {
    const raw = window.localStorage.getItem(KEY);
    return COLORBLIND_MODES.some((m) => m.id === raw) ? (raw as ColorblindMode) : DEFAULT_COLORBLIND_MODE;
  } catch {
    return DEFAULT_COLORBLIND_MODE;
  }
}

export function saveLocalColorblindMode(mode: ColorblindMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // storage unavailable/full — the choice just won't persist across visits
  }
}

export function applyColorblindMode(mode: ColorblindMode): void {
  if (typeof document === "undefined") return;
  if (mode === "off") {
    document.documentElement.removeAttribute("data-colorblind");
  } else {
    document.documentElement.setAttribute("data-colorblind", mode);
  }
}
