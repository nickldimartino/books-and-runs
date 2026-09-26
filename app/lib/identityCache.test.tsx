import { beforeEach, describe, expect, it } from "vitest";
import { identityIsFresh, readIdentity, resetIdentityCacheForTests, writeIdentity } from "./identityCache";

const avatar = { kind: "emoji" as const, emoji: "🦊", color: "#fff", photoPath: null };

describe("identityCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetIdentityCacheForTests();
  });

  it("returns nothing before anything was written", () => {
    expect(readIdentity("u1")).toBeNull();
    expect(identityIsFresh("u1")).toBe(false);
  });

  it("round-trips through memory and through a reload (localStorage)", () => {
    writeIdentity("u1", { name: "Nicky D", avatar });
    expect(readIdentity("u1")).toEqual({ name: "Nicky D", avatar });
    expect(identityIsFresh("u1")).toBe(true);

    resetIdentityCacheForTests(); // a fresh page load: only localStorage remains
    expect(readIdentity("u1")).toEqual({ name: "Nicky D", avatar });
    expect(identityIsFresh("u1")).toBe(false); // from storage → revalidate
  });

  it("never hands one account's identity to another", () => {
    writeIdentity("u1", { name: "Nicky D", avatar });
    expect(readIdentity("u2")).toBeNull();
    resetIdentityCacheForTests();
    expect(readIdentity("u2")).toBeNull();
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem("booksAndRuns:identity", "{not json");
    expect(readIdentity("u1")).toBeNull();
  });
});
