import { describe, expect, it } from "vitest";
import { navStateFor, normalizePath } from "./navVisibility";

describe("navStateFor", () => {
  it("shows the nav on hub / list screens and maps each to its tab", () => {
    const cases: [string, string][] = [
      ["/", "play"],
      ["/progress", "progress"],
      ["/achievements", "progress"],
      ["/leaderboard", "progress"],
      ["/social", "social"],
      ["/friends", "social"],
      ["/clubs", "social"],
      ["/tournaments", "social"],
      ["/profile", "profile"],
      ["/player", "profile"],
      ["/settings", "profile"],
      ["/account", "profile"],
      ["/history", "profile"],
      ["/how-to-play", "profile"],
    ];
    for (const [path, tab] of cases) {
      expect(navStateFor(path), path).toEqual({ visible: true, active: tab });
    }
  });

  it("tolerates trailing slashes, query strings, hashes and case", () => {
    expect(navStateFor("/friends/").active).toBe("social");
    expect(navStateFor("/clubs?id=abc").active).toBe("social");
    expect(navStateFor("/settings#audio").active).toBe("profile");
    expect(navStateFor("/Progress").active).toBe("progress");
    expect(navStateFor("").active).toBe("play");
    expect(navStateFor(null).active).toBe("play");
    expect(normalizePath("//")).toBe("/");
  });

  it("hides the nav on in-game, setup, auth and focused screens", () => {
    for (const path of [
      "/game",
      "/multiplayer/play",
      "/multiplayer",
      "/new-game",
      "/new-game/local",
      "/new-game/multiplayer",
      "/sign-in",
      "/reset-password",
      "/tournaments/new",
      "/settings/theme",
      "/settings/card-back",
      "/scorecard",
      "/tip",
      "/no-such-page",
    ]) {
      expect(navStateFor(path), path).toEqual({ visible: false, active: null });
    }
  });
});
