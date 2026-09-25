// Keyboard shortcuts for the game screens (solo/pass-and-play and multiplayer).
// The gamepad layer (GamepadNavigation.tsx) reuses these by dispatching the
// same key events, so there's one binding table for keyboard and controller.
//
// Enter/Space (select the focused card or press the focused button) and
// arrow-key movement between cards are handled natively / in DraggableHand,
// not here — this table is only the global, "no particular element focused"
// shortcuts.

import type { TranslationKey } from "./i18n/keys";

export type ShortcutAction =
  | "draw"
  | "drawDiscard"
  | "sortRank"
  | "sortSuit"
  | "group"
  | "discard"
  | "undo"
  | "focusHand"
  | "help"
  | "escape";

interface ShortcutDef {
  action: ShortcutAction;
  /** Key caps as shown in the help sheet (each is one <kbd>). */
  keys: string[];
  labelKey: TranslationKey;
}

/** Order here is the order of the help sheet. */
export const SHORTCUTS: ShortcutDef[] = [
  { action: "draw", keys: ["D"], labelKey: "shortcuts.draw" },
  { action: "drawDiscard", keys: ["Shift+D", "F"], labelKey: "shortcuts.drawDiscard" },
  { action: "focusHand", keys: ["H"], labelKey: "shortcuts.focusHand" },
  { action: "group", keys: ["M"], labelKey: "shortcuts.group" },
  { action: "discard", keys: ["Del", "Backspace"], labelKey: "shortcuts.discard" },
  { action: "sortRank", keys: ["S"], labelKey: "shortcuts.sortRank" },
  { action: "sortSuit", keys: ["Shift+S"], labelKey: "shortcuts.sortSuit" },
  { action: "undo", keys: ["U", "Ctrl+Z"], labelKey: "shortcuts.undo" },
  { action: "help", keys: ["?"], labelKey: "shortcuts.help" },
  { action: "escape", keys: ["Esc"], labelKey: "shortcuts.close" },
];

/** True when the event target is somewhere a player types text — shortcuts
 * must never fire there. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // Buttons/checkboxes/sliders aren't text entry — Space/letters there
    // shouldn't be swallowed, but they also don't need our shortcuts, so be
    // conservative: only skip real text-ish inputs.
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(type);
  }
  return el.isContentEditable === true;
}

interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

/** Maps a keydown to a shortcut action, or null. Pure — no DOM. */
export function matchShortcut(e: KeyLike): ShortcutAction | null {
  if (e.altKey || e.repeat) return null;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k.toLowerCase() === "z") return "undo";
  if (e.ctrlKey || e.metaKey) return null;
  switch (k) {
    case "d":
      return "draw";
    case "D":
      return "drawDiscard";
    case "f":
    case "F":
      return "drawDiscard";
    case "s":
      return "sortRank";
    case "S":
      return "sortSuit";
    case "m":
    case "M":
      return "group";
    case "Delete":
    case "Backspace":
      return "discard";
    case "u":
    case "U":
      return "undo";
    case "h":
    case "H":
      return "focusHand";
    case "?":
      return "help";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}
