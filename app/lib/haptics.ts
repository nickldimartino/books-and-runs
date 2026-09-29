import { Capacitor } from "@capacitor/core";
import type { ImpactStyle, NotificationType } from "@capacitor/haptics";
import { loadLocalSettings } from "./settingsStore";
import { isTutorialAudioOverride } from "./sound";

/**
 * Short haptic taps at the same moments sound.ts plays a sound effect —
 * see each call site for which one pairs with which. Native (Capacitor iOS)
 * uses the Haptics plugin; the plain web build falls back to
 * navigator.vibrate, which Android Chrome honours and iOS Safari silently
 * ignores. Gated on its own "Haptics" setting, independent of "Sound
 * effects" (see settingsStore.ts's hapticsEnabled) — unlike iOS's own
 * Settings, which groups Sound & Haptics as one switch, this app lets
 * either be off without the other. Still shares sound.ts's tutorial
 * override, which shows off both regardless of either saved preference.
 *
 * `@capacitor/haptics`' actual plugin code is dynamically imported, only
 * inside the native branch — this file (and its call sites, game/page.tsx
 * and useMpGame.ts) runs on the web the overwhelming majority of the time,
 * where `Capacitor.isNativePlatform()` is always false, so the plugin has
 * no reason to be in the initial JS a web player downloads. The `import
 * type` above costs nothing at runtime (TypeScript erases it entirely) —
 * it's what lets this file use the real ImpactStyle/NotificationType enums
 * for type-checking without pulling in the module that defines them.
 */

function allowed(): boolean {
  return isTutorialAudioOverride() || loadLocalSettings().hapticsEnabled;
}

function webVibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported, or blocked without a user gesture — nice-to-have only.
  }
}

/** Rumble a connected gamepad, independent of native/web — a Bluetooth
 * controller can be paired on either. Silent no-op with no pad connected,
 * on a browser that never implemented `vibrationActuator` (Firefox, as of
 * this writing), or on a pad whose actuator doesn't support dual-rumble.
 * Always tried alongside whichever of native Haptics / navigator.vibrate
 * above actually applies — this is a third, independent channel, not a
 * replacement for either. */
function rumble(weakMagnitude: number, strongMagnitude: number, duration: number): void {
  try {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((g): g is Gamepad => !!g?.connected);
    const actuator = pad?.vibrationActuator;
    if (!actuator?.playEffect) return;
    void actuator.playEffect("dual-rumble", { startDelay: 0, duration, weakMagnitude, strongMagnitude }).catch(() => {});
  } catch {
    // No Gamepad API in this browser — nice-to-have only.
  }
}

/** Two short rumbles with a gap — the controller equivalent of the
 * double-buzz `webVibrate([on, off, on])` pattern hapticError/hapticSuccess
 * already use, since `playEffect` only ever plays one continuous effect. */
function rumbleDouble(weakMagnitude: number, strongMagnitude: number, pulseMs: number, gapMs: number): void {
  rumble(weakMagnitude, strongMagnitude, pulseMs);
  setTimeout(() => rumble(weakMagnitude, strongMagnitude, pulseMs), pulseMs + gapMs);
}

async function nativeImpact(style: ImpactStyle): Promise<void> {
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.impact({ style });
  } catch {
    // No haptics hardware, or motion/haptics permission denied.
  }
}

async function nativeNotification(type: NotificationType): Promise<void> {
  try {
    const { Haptics } = await import("@capacitor/haptics");
    await Haptics.notification({ type });
  } catch {
    // No haptics hardware, or motion/haptics permission denied.
  }
}

function impact(style: ImpactStyle, webMs: number, weak: number, strong: number): void {
  if (!allowed()) return;
  rumble(weak, strong, webMs);
  if (Capacitor.isNativePlatform()) {
    void nativeImpact(style);
    return;
  }
  webVibrate(webMs);
}

/** Selecting or drawing a card. */
export function hapticLight(): void {
  impact("LIGHT" as ImpactStyle, 8, 0.25, 0.1);
}

/** Confirming a meld. */
export function hapticMedium(): void {
  impact("MEDIUM" as ImpactStyle, 18, 0.35, 0.25);
}

/** Winning a round or the game. */
export function hapticSuccess(): void {
  if (!allowed()) return;
  rumble(0.55, 0.8, 220);
  if (Capacitor.isNativePlatform()) {
    void nativeNotification("SUCCESS" as NotificationType);
    return;
  }
  webVibrate([14, 40, 14]);
}

/** A move the game rejected (invalid meld, lay-off or discard) — a short
 * double buzz, distinct from the single taps above. */
export function hapticError(): void {
  if (!allowed()) return;
  rumbleDouble(0.4, 0.3, 30, 40);
  if (Capacitor.isNativePlatform()) {
    void nativeNotification("ERROR" as NotificationType);
    return;
  }
  webVibrate([30, 40, 30]);
}

/** It's your turn again after the AIs played. */
export function hapticTurn(): void {
  impact("LIGHT" as ImpactStyle, 12, 0.25, 0.15);
}

/** Discarding a card — a firmer single tap than selecting one. */
export function hapticDiscard(): void {
  impact("MEDIUM" as ImpactStyle, 14, 0.3, 0.2);
}
