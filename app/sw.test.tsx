// The service worker's pure decision helpers (sw/sw.template.js) — which
// strategy a request gets, how pages are keyed, which caches/entries get
// dropped. The worker's own event wiring needs a real browser; these are the
// parts whose mistakes cause stale-bundle traps, so they're pinned here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Helpers = {
  classifyRequest: (method: string, mode: string, destination: string, url: string, origin: string) => string;
  navigationKey: (url: string) => string;
  cachesToDelete: (names: string[], shell: string, stat: string) => string[];
  keysToEvict: (keys: string[], max: number, protectedUrls?: string[]) => string[];
  isCacheable: (status: number, type: string, contentLength: string | null) => boolean;
};

function loadHelpers(): Helpers {
  const src = readFileSync(join(process.cwd(), "sw", "sw.template.js"), "utf8").replaceAll("__BUILD_ID__", "testbuild");
  const mod = { exports: {} as unknown };
  const fakeSelf = { addEventListener: () => {}, location: { origin: "https://x.test" } };
  new Function("self", "module", src)(fakeSelf, mod);
  return mod.exports as Helpers;
}

const h = loadHelpers();
const ORIGIN = "https://x.test";

describe("classifyRequest", () => {
  it("never touches non-GET or cross-origin requests", () => {
    expect(h.classifyRequest("POST", "cors", "", `${ORIGIN}/a.js`, ORIGIN)).toBe("skip");
    expect(h.classifyRequest("GET", "cors", "", "https://abc.supabase.co/rest/v1/x", ORIGIN)).toBe("skip");
  });
  it("treats /_next/static as immutable, other statics as stale-while-revalidate", () => {
    expect(h.classifyRequest("GET", "no-cors", "script", `${ORIGIN}/_next/static/chunks/a1b2.js`, ORIGIN)).toBe("immutable");
    expect(h.classifyRequest("GET", "no-cors", "script", `${ORIGIN}/init.js?v=abc`, ORIGIN)).toBe("swr");
    expect(h.classifyRequest("GET", "no-cors", "image", `${ORIGIN}/icons/icon-192.png`, ORIGIN)).toBe("swr");
    expect(h.classifyRequest("GET", "cors", "", `${ORIGIN}/manifest.webmanifest`, ORIGIN)).toBe("swr");
  });
  it("routes navigations and RSC payloads to network-first", () => {
    expect(h.classifyRequest("GET", "navigate", "document", `${ORIGIN}/friends`, ORIGIN)).toBe("navigate");
    expect(h.classifyRequest("GET", "cors", "", `${ORIGIN}/friends/__next.friends.txt`, ORIGIN)).toBe("rsc");
  });
  it("never caches the service worker script itself", () => {
    expect(h.classifyRequest("GET", "same-origin", "serviceworker", `${ORIGIN}/sw.js`, ORIGIN)).toBe("skip");
  });
});

describe("navigationKey", () => {
  it("ignores query strings, hashes and trailing slashes", () => {
    expect(h.navigationKey(`${ORIGIN}/multiplayer/play?id=abc#x`)).toBe(`${ORIGIN}/multiplayer/play`);
    expect(h.navigationKey(`${ORIGIN}/friends/`)).toBe(`${ORIGIN}/friends`);
    expect(h.navigationKey(`${ORIGIN}/`)).toBe(`${ORIGIN}/`);
  });
});

describe("cachesToDelete (the migration path from old workers)", () => {
  it("drops the legacy br-shell-v1 and superseded per-deploy caches, keeps current + foreign", () => {
    const names = ["br-shell-v1", "br-shell-old", "br-shell-testbuild", "br-static-v2", "someone-else"];
    expect(h.cachesToDelete(names, "br-shell-testbuild", "br-static-v2")).toEqual(["br-shell-v1", "br-shell-old"]);
  });
});

describe("keysToEvict", () => {
  it("evicts oldest-first down to the cap", () => {
    expect(h.keysToEvict(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
    expect(h.keysToEvict(["a", "b"], 2)).toEqual([]);
  });
  it("never evicts protected entries (the offline page), taking the next-oldest instead", () => {
    expect(h.keysToEvict(["offline", "a", "b", "c"], 2, ["offline"])).toEqual(["a", "b"]);
  });
});

describe("isCacheable", () => {
  it("only keeps successful same-origin responses under the size cap", () => {
    expect(h.isCacheable(200, "basic", "1000")).toBe(true);
    expect(h.isCacheable(200, "basic", null)).toBe(true);
    expect(h.isCacheable(404, "basic", "10")).toBe(false);
    expect(h.isCacheable(200, "opaque", null)).toBe(false);
    expect(h.isCacheable(200, "basic", "99999999")).toBe(false);
  });
});
