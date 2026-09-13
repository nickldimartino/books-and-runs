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

function impact(style: ImpactStyle, webMs: number): void {
  if (!allowed()) return;
  if (Capacitor.isNativePlatform()) {
    void nativeImpact(style);
    return;
  }
  webVibrate(webMs);
}

/** Selecting or drawing a card. */
export function hapticLight(): void {
  impact("LIGHT" as ImpactStyle, 8);
}

/** Confirming a meld. */
export function hapticMedium(): void {
  impact("MEDIUM" as ImpactStyle, 18);
}

/** Winning a round or the game. */
export function hapticSuccess(): void {
  if (!allowed()) return;
  if (Capacitor.isNativePlatform()) {
    void nativeNotification("SUCCESS" as NotificationType);
    return;
  }
  webVibrate([14, 40, 14]);
}
