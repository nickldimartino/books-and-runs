// @vitest-environment jsdom

// startPurchase's whole job: POST { skus } to create-checkout-session with a
// bearer token, then redirect to the { url } it returns. Mocked fetch + a
// stub Supabase client, same pattern as useMpGame.test.tsx's callMp tests —
// no live Edge Function.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakeSupabase = {
  auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) },
};

vi.mock("./supabaseClient", () => ({
  supabase: fakeSupabase,
  loadSupabase: vi.fn(async () => fakeSupabase),
}));

function installFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

// jsdom's window.location isn't (easily) reassignable — the redirect is
// observed by spying on the setter instead of asserting the real navigation.
function spyOnLocationHref(): { get: () => string | undefined } {
  let value: string | undefined;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, set href(v: string) { value = v; }, get href() { return value ?? ""; } },
  });
  return { get: () => value };
}

describe("startPurchase", () => {
  beforeEach(() => {
    fakeSupabase.auth.getSession.mockClear();
    // FN_URL is built from this at module-eval time — vitest doesn't load
    // .env.local (that's a Next.js-only convention), so it must be set
    // before each test's dynamic import for the URL to be non-empty.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("posts { skus } with a bearer token and redirects to the returned url", async () => {
    const fetchMock = installFetch(200, { url: "https://checkout.stripe.com/session/abc" });
    const href = spyOnLocationHref();
    const { startPurchase } = await import("./purchasing");

    await startPurchase(["badge:🎩", "bundle:supporter"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string> | undefined;
    expect(String(url)).toContain("create-checkout-session");
    expect(headers?.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(String(init?.body))).toEqual({ skus: ["badge:🎩", "bundle:supporter"] });
    expect(href.get()).toBe("https://checkout.stripe.com/session/abc");
  });

  it("throws PurchaseError with the server's own message on a non-2xx response", async () => {
    installFetch(409, { error: "You already own this." });
    const { startPurchase, PurchaseError } = await import("./purchasing");

    await expect(startPurchase(["badge:🎩"])).rejects.toThrow("You already own this.");
    await expect(startPurchase(["badge:🎩"])).rejects.toBeInstanceOf(PurchaseError);
  });

  it("rejects an empty sku list without calling fetch", async () => {
    const fetchMock = installFetch(200, { url: "https://example.com" });
    const { startPurchase } = await import("./purchasing");

    await expect(startPurchase([])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
