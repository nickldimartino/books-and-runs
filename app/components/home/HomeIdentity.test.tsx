// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LevelProgress } from "@/leveling";
import { HomeIdentity } from "./HomeIdentity";
import { resetIdentityCacheForTests, writeIdentity } from "../../lib/identityCache";

const level = {
  level: 25,
  xpIntoLevel: 10,
  xpSpanForLevel: 100,
  progressFraction: 0.1,
} as unknown as LevelProgress;

beforeEach(() => {
  window.localStorage.clear();
  resetIdentityCacheForTests();
});
afterEach(cleanup);

describe("HomeIdentity", () => {
  it("shows the last known name and avatar on the very first render (no default flash)", () => {
    writeIdentity("u1", { name: "Nicky D", avatar: { kind: "emoji", emoji: "🦊", color: "#123456", photoPath: null } });
    resetIdentityCacheForTests(); // as after a page load: only localStorage remains
    render(<HomeIdentity userId="u1" level={level} loading={false} variant="chip" />);
    expect(screen.getByText("Nicky D")).toBeTruthy();
    expect(screen.getByText("🦊")).toBeTruthy();
  });
});
