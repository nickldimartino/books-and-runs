// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { accountSwitched } from "./accountScope";

beforeEach(() => {
  window.localStorage.clear();
});

describe("accountSwitched", () => {
  it("is false the very first time this device has ever tracked an account", () => {
    expect(accountSwitched("user-a")).toBe(false);
  });

  it("is false on repeated calls for the same account", () => {
    accountSwitched("user-a");
    expect(accountSwitched("user-a")).toBe(false);
    expect(accountSwitched("user-a")).toBe(false);
  });

  it("is true the moment a genuinely different account is seen", () => {
    accountSwitched("user-a");
    expect(accountSwitched("user-b")).toBe(true);
  });

  it("only fires once per actual switch, not again for the new account afterward", () => {
    accountSwitched("user-a");
    expect(accountSwitched("user-b")).toBe(true);
    expect(accountSwitched("user-b")).toBe(false);
  });

  it("a guest interlude doesn't erase which real account this device last saw", () => {
    accountSwitched("user-a");
    // A guest session never calls this at all (see AccountSwitchGuard,
    // which only runs when `user` is set) — simulated here simply by not
    // calling accountSwitched during that stretch, then user A returning.
    expect(accountSwitched("user-a")).toBe(false);
  });
});
