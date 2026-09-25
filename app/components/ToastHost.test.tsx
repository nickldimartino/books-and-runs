// @vitest-environment jsdom

// The shared toast host: one persistent live region, translated keys,
// auto-dismiss, sticky + action toasts (the update prompt), same-id replace.

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissToast, toast } from "../lib/toastBus";
import { ToastHost } from "./ToastHost";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ToastHost", () => {
  it("has a polite live region before anything is shown (so later toasts are announced)", () => {
    render(<ToastHost />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
  });

  it("shows a translated key and clears itself", () => {
    render(<ToastHost />);
    act(() => toast({ key: "toast.saved", kind: "success", duration: 1000 }));
    expect(screen.getByText("Saved")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("interpolates vars and accepts pre-translated text", () => {
    render(<ToastHost />);
    act(() => toast({ text: "Hello there" }));
    expect(screen.getByText("Hello there")).toBeTruthy();
  });

  it("sticky toast with an action stays until dismissed and runs the action", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onClick = vi.fn();
    render(<ToastHost />);
    act(() => toast({ id: "sw-update", key: "update.newVersion", duration: 0, action: { labelKey: "update.refresh", onClick } }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText(/new version/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByText(/new version/i)).toBeNull();
  });

  it("same id replaces, dismissToast removes", () => {
    render(<ToastHost />);
    act(() => toast({ id: "x", text: "one", duration: 0 }));
    act(() => toast({ id: "x", text: "two", duration: 0 }));
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.getByText("two")).toBeTruthy();
    act(() => dismissToast("x"));
    expect(screen.queryByText("two")).toBeNull();
  });
});
