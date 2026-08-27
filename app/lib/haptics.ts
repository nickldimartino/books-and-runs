import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { soundEnabled } from "./sound";

/**
 * Short haptic taps at the same moments sound.ts plays a sound effect —
 * see each call site for which one pairs with which. Native-only: the
 * Haptics plugin's web implementation silently no-ops in a browser tab
 * anyway, but checking Capacitor.isNativePlatform() first skips the
 * pointless native-bridge round trip when this is running as the website
 * rather than the iOS app. Gated on the same "Sound effects" setting sound.ts
 * itself checks (soundEnabled(), which already covers the tutorial
 * override too) rather than a separate toggle — matches how iOS's own
 * Settings app groups Sound & Haptics as one thing, not two.
 */

function enabled(): boolean {
  return Capacitor.isNativePlatform() && soundEnabled();
}

function impact(style: ImpactStyle): void {
  if (!enabled()) return;
  Haptics.impact({ style }).catch(() => {
    // No haptics hardware, or the user denied motion/haptics permission —
    // either way, this is strictly a nice-to-have, so fail silently.
  });
}

/** Selecting or drawing a card. */
export function hapticLight(): void {
  impact(ImpactStyle.Light);
}

/** Confirming a meld. */
export function hapticMedium(): void {
  impact(ImpactStyle.Medium);
}

/** Winning a round or the game. */
export function hapticSuccess(): void {
  if (!enabled()) return;
  Haptics.notification({ type: NotificationType.Success }).catch(() => {});
}
