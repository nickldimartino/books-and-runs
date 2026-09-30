import { beforeEach, describe, expect, it } from "vitest";
import { labelKeyFor, normalizeTrailPath, previousPath, recordPath, resetNavTrailForTests } from "./navTrail";

beforeEach(() => resetNavTrailForTests());

describe("navTrail", () => {
  it("normalises paths", () => {
    expect(normalizeTrailPath("/friends/?x=1#a")).toBe("/friends");
    expect(normalizeTrailPath("")).toBe("/");
    expect(normalizeTrailPath(null)).toBe("/");
  });

  it("remembers the page you came from", () => {
    recordPath("/");
    recordPath("/progress");
    recordPath("/leaderboard");
    expect(previousPath("/leaderboard")).toBe("/progress");
  });

  it("has no previous page on a direct load", () => {
    recordPath("/leaderboard");
    expect(previousPath("/leaderboard")).toBeNull();
  });

  it("still answers correctly if asked before the tracker recorded the new page", () => {
    recordPath("/social");
    expect(previousPath("/new-game/multiplayer")).toBe("/social");
  });

  it("ignores repeats of the same page and never goes back to sign-in or a game", () => {
    recordPath("/sign-in");
    recordPath("/");
    recordPath("/");
    expect(previousPath("/")).toBeNull();
    recordPath("/game");
    recordPath("/settings");
    expect(previousPath("/settings")).toBeNull();
  });

  it("doesn't ping-pong: Back then Back again runs out of trail instead of bouncing forward", () => {
    // A → B → C, then Back (→ B), then Back again — should run out of
    // trail (falls back to B's own static href), not bounce forward to C.
    recordPath("/");
    recordPath("/new-game");
    recordPath("/new-game/multiplayer");
    expect(previousPath("/new-game/multiplayer")).toBe("/new-game");
    // The navigation the Back click triggers reaches this tracker exactly
    // like any other route change.
    recordPath("/new-game");
    expect(previousPath("/new-game")).toBeNull();
  });

  it("labels known destinations and falls back to Back", () => {
    expect(labelKeyFor("/social/")).toBe("nav.social");
    expect(labelKeyFor("/whatever")).toBe("common.back");
  });
});
