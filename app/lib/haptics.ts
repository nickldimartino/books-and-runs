import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { soundEnabled } from "./sound";

/**
 * Short haptic taps at the same moments sound.ts plays a sound effect —
 * see each call site for which one pairs with which. Native (Capacitor iOS)
 * uses the Haptics plugin; the plain web build falls back to
 * navigator.vibrate, which Android Chrome honours and iOS Safari silently
 * ignores. Gated on the same "Sound effects" setting sound.ts checks
 * (soundEnabled(), which already covers the tutorial override) rather than
 * a separate toggle — matches how iOS's own Settings groups Sound &
 * Haptics as one thing.
 */

function allowed(): boolean {
  return soundEnabled();
}

function webVibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported, or blocked without a user gesture — nice-to-have only.
  }
}

function impact(style: ImpactStyle, webMs: number): void {
  if (!allowed()) return;
  if (Capacitor.isNativePlatform()) {
    Haptics.impact({ style }).catch(() => {
      // No haptics hardware, or motion/haptics permission denied.
    });
    return;
  }
  webVibrate(webMs);
}

/** Selecting or drawing a card. */
export function hapticLight(): void {
  impact(ImpactStyle.Light, 8);
}

/** Confirming a meld. */
export function hapticMedium(): void {
  impact(ImpactStyle.Medium, 18);
}

/** Winning a round or the game. */
export function hapticSuccess(): void {
  if (!allowed()) return;
  if (Capacitor.isNativePlatform()) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    return;
  }
  webVibrate([14, 40, 14]);
}
