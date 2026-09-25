// Game-speed and reduce-motion helpers. Both are HouseSettings (settingsStore.ts)
// that must be readable synchronously from non-React code (the AI loop, the
// card-flight layer, canvas confetti), so everything here just re-reads the
// local settings on each call — same pattern sound.ts uses for its volume.
//
// Reduce motion has three consumers that must agree:
//   1. <html data-reduce-motion="on"> — set by applyReduceMotion() and, before
//      first paint, by public/init.js; globals.css keys its animation/transition
//      kill-switch off it.
//   2. prefersReducedMotion() — for JS animation (flights, confetti, tallies).
//   3. The OS media query, which the existing CSS still honours directly.

import { GAME_SPEEDS, GameSpeed, loadLocalSettings, ReduceMotionPref } from "./settingsStore";

/** Multiplier applied to every pause/animation duration. 0 = skip entirely. */
const SPEED_FACTOR: Record<GameSpeed, number> = {
  relaxed: 1.6,
  normal: 1,
  fast: 0.5,
  instant: 0,
};

export function currentGameSpeed(): GameSpeed {
  const s = loadLocalSettings().gameSpeed;
  return GAME_SPEEDS.includes(s) ? s : "normal";
}

export function speedFactor(speed: GameSpeed = currentGameSpeed()): number {
  return SPEED_FACTOR[speed];
}

/** Scales a duration in ms by the current game speed. */
export function scaleMs(ms: number, speed: GameSpeed = currentGameSpeed()): number {
  return Math.round(ms * SPEED_FACTOR[speed]);
}

export function osPrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function isReduceMotionPref(v: unknown): v is ReduceMotionPref {
  return v === "system" || v === "on";
}

/** True when animation should be skipped or shortened: the in-app setting is
 * "on", or it follows the system and the OS asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const pref = loadLocalSettings().reduceMotion;
  return pref === "on" || osPrefersReducedMotion();
}

/** Mirrors the setting onto <html data-reduce-motion="on"> (removed
 * otherwise). "system" doesn't set it: the OS media queries in globals.css
 * already cover that case. */
export function applyReduceMotion(pref: ReduceMotionPref): void {
  if (typeof document === "undefined") return;
  if (pref === "on") document.documentElement.setAttribute("data-reduce-motion", "on");
  else document.documentElement.removeAttribute("data-reduce-motion");
}

/** Flight length used by CardFlightLayer, scaled by game speed. 0 = no flight. */
export function flightMs(): number {
  return scaleMs(380);
}
