// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hapticDiscard, hapticError, hapticLight, hapticMedium, hapticSuccess } from "./haptics";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

function fakePad(playEffect: ReturnType<typeof vi.fn> | null): Gamepad {
  return {
    connected: true,
    vibrationActuator: playEffect ? ({ playEffect } as unknown as GamepadHapticActuator) : undefined,
  } as unknown as Gamepad;
}

describe("gamepad rumble", () => {
  let playEffect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    playEffect = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      vibrate: vi.fn(),
      getGamepads: () => [fakePad(playEffect)],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("plays a dual-rumble effect on the connected pad when a light haptic fires", () => {
    hapticLight();
    expect(playEffect).toHaveBeenCalledWith(
      "dual-rumble",
      expect.objectContaining({ duration: 8, weakMagnitude: 0.25, strongMagnitude: 0.1 })
    );
  });

  it("does nothing when Haptics is turned off in Settings", () => {
    localStorage.setItem("booksAndRuns:settings", JSON.stringify({ hapticsEnabled: false }));
    hapticMedium();
    expect(playEffect).not.toHaveBeenCalled();
  });

  it("plays two pulses for the error double-buzz", async () => {
    vi.useFakeTimers();
    hapticError();
    expect(playEffect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(80);
    expect(playEffect).toHaveBeenCalledTimes(2);
  });

  it("never throws when no gamepad is connected", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: vi.fn(), getGamepads: () => [] });
    expect(() => hapticSuccess()).not.toThrow();
  });

  it("never throws when the connected pad has no vibrationActuator", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: vi.fn(), getGamepads: () => [fakePad(null)] });
    expect(() => hapticDiscard()).not.toThrow();
  });
});
