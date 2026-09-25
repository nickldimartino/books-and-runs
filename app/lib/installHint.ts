// "Install the app" nudge — logic only (the UI is components/InstallHint.tsx).
//
// Why: this is a PWA that leans on Web Push, and on iOS push exists *only*
// once the app is on the Home Screen; on Android/desktop Chrome an installed
// app also survives storage eviction and launches full-screen. The hint is
// deliberately rare — one card, after the player has actually finished a
// game (never before they've seen what the app is), gone for good once the
// app is installed, and backed off exponentially each time it's dismissed.
//
//   - Chromium: the `beforeinstallprompt` event is captured (and its default
//     mini-infobar suppressed) so a real "Install" button can trigger it.
//   - iOS Safari: no such API exists, so the card explains Share → Add to
//     Home Screen instead (see pushSubscriptions.ts isIosSafariNonStandalone,
//     and the notification copy that says push needs the Home Screen).

import { readLocalStorage, writeLocalStorage } from "./localStorageUtil";

const KEY = "booksAndRuns:installHint";
export const GAME_COMPLETED_EVENT = "br:game-completed";
export const INSTALL_PROMPT_READY_EVENT = "br:install-prompt-ready";

const DAY_MS = 24 * 60 * 60 * 1000;
/** After this many dismissals the card never comes back. */
export const MAX_DISMISSALS = 3;

interface StoredState {
  completedGames: number;
  dismissals: number;
  lastDismissedAt: number | null;
  installed: boolean;
}

const EMPTY: StoredState = { completedGames: 0, dismissals: 0, lastDismissedAt: null, installed: false };

export function loadInstallState(): StoredState {
  const raw = readLocalStorage(KEY);
  if (!raw) return { ...EMPTY };
  try {
    const p = JSON.parse(raw) as Partial<StoredState>;
    return {
      completedGames: typeof p.completedGames === "number" ? p.completedGames : 0,
      dismissals: typeof p.dismissals === "number" ? p.dismissals : 0,
      lastDismissedAt: typeof p.lastDismissedAt === "number" ? p.lastDismissedAt : null,
      installed: p.installed === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(state: StoredState): void {
  writeLocalStorage(KEY, JSON.stringify(state));
}

/** Days to stay quiet after the nth dismissal: 7, 14, 28 (doubling). */
export function backoffMs(dismissals: number): number {
  if (dismissals <= 0) return 0;
  return 7 * DAY_MS * 2 ** (dismissals - 1);
}

export type InstallHintKind = "prompt" | "ios";

export interface InstallHintInput {
  state: StoredState;
  now: number;
  /** Running as an installed app already (display-mode: standalone / navigator.standalone). */
  standalone: boolean;
  /** A captured `beforeinstallprompt` is available (Chromium). */
  canPrompt: boolean;
  /** iOS/iPadOS Safari in a regular tab (the Share-sheet path). */
  iosSafari: boolean;
}

/** Which card (if any) to show right now. Pure — every gate lives here. */
export function installHintKind(i: InstallHintInput): InstallHintKind | null {
  const { state } = i;
  if (i.standalone || state.installed) return null;
  if (state.completedGames < 1) return null;
  if (state.dismissals >= MAX_DISMISSALS) return null;
  if (state.lastDismissedAt !== null && i.now - state.lastDismissedAt < backoffMs(state.dismissals)) return null;
  if (i.canPrompt) return "prompt";
  if (i.iosSafari) return "ios";
  return null;
}

/** Called when a game finishes (analytics.ts's track("game_completed")). */
export function recordGameCompleted(): void {
  const state = loadInstallState();
  state.completedGames += 1;
  save(state);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(GAME_COMPLETED_EVENT));
}

export function recordInstallDismissed(now = Date.now()): void {
  const state = loadInstallState();
  state.dismissals += 1;
  state.lastDismissedAt = now;
  save(state);
}

export function recordInstalled(): void {
  const state = loadInstallState();
  state.installed = true;
  save(state);
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    !!window.matchMedia?.("(display-mode: standalone)").matches
  );
}

// ── beforeinstallprompt capture ──────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let listening = false;

/** Starts capturing the install event. Idempotent; call as early as possible
 * on the client (the event can fire soon after load). */
export function captureInstallPrompt(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress Chrome's own mini-infobar; we show our card at the right moment
    deferredPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_PROMPT_READY_EVENT));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    recordInstalled();
    window.dispatchEvent(new Event(INSTALL_PROMPT_READY_EVENT));
  });
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Shows the browser's install dialog. Resolves whether the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const evt = deferredPrompt;
  if (!evt) return false;
  deferredPrompt = null; // a captured event can only be used once
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") recordInstalled();
    return outcome === "accepted";
  } catch {
    return false;
  }
}

// ── persistent storage ───────────────────────────────────────────────────────

const PERSIST_KEY = "booksAndRuns:persistAsked";

/**
 * Asks the browser not to evict this origin's storage. The in-progress solo
 * save, queued achievement/progress writes and pending-save queue all live in
 * localStorage, which Safari's 7-day ITP purge and low-disk eviction can wipe
 * for a non-installed site. Chromium grants it silently to engaged/installed
 * sites, Firefox prompts — so this is called only at moments of clear
 * commitment (finishing a game, signing in), and only once per device.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  if (readLocalStorage(PERSIST_KEY) === "1") return null;
  try {
    if (await navigator.storage.persisted?.()) {
      writeLocalStorage(PERSIST_KEY, "1");
      return true;
    }
    const granted = await navigator.storage.persist();
    writeLocalStorage(PERSIST_KEY, "1");
    return granted;
  } catch {
    return null;
  }
}
