// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { isChannelDead, RESUME_DEBOUNCE_MS, useResumeRefresh } from "./resumeRefresh";

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility("visible");
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useResumeRefresh", () => {
  it("refreshes once when the tab becomes visible again", () => {
    const cb = vi.fn();
    renderHook(() => useResumeRefresh(cb));
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(cb).not.toHaveBeenCalled(); // going to the background is not a resume
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS - 1);
    expect(cb).not.toHaveBeenCalled(); // debounced
    vi.advanceTimersByTime(2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("coalesces focus + visibilitychange + online into a single refresh", () => {
    const cb = vi.fn();
    renderHook(() => useResumeRefresh(cb));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 3);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("refreshes on a bfcache restore only when the page was actually restored", () => {
    const cb = vi.fn();
    renderHook(() => useResumeRefresh(cb));
    const plain = new Event("pageshow");
    Object.defineProperty(plain, "persisted", { value: false });
    window.dispatchEvent(plain);
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(cb).not.toHaveBeenCalled();
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("always calls the latest callback, does nothing when disabled, and cleans up", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ fn, on }) => useResumeRefresh(fn, on), {
      initialProps: { fn: first, on: true },
    });
    rerender({ fn: second, on: true });
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    rerender({ fn: second, on: false });
    window.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(second).toHaveBeenCalledTimes(1);

    rerender({ fn: second, on: true });
    window.dispatchEvent(new Event("online"));
    unmount(); // pending timer must be cancelled with the listeners
    vi.advanceTimersByTime(RESUME_DEBOUNCE_MS * 2);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("isChannelDead", () => {
  it("flags only channels that can no longer deliver", () => {
    expect(isChannelDead("closed")).toBe(true);
    expect(isChannelDead("errored")).toBe(true);
    for (const s of ["joined", "joining", "leaving", undefined, null]) expect(isChannelDead(s)).toBe(false);
  });
});
