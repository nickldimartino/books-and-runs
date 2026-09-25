// @vitest-environment jsdom

// The pieces around Supabase's magic-link / OAuth calls that the static
// export has to get right by itself: where to land after an emailed link
// (possibly opened in another tab), inferring a brand-new account, and the
// provider config flag.

import { afterEach, describe, expect, it } from "vitest";
import {
  enabledOAuthProviders,
  isFreshAccount,
  parseAuthRedirectError,
  safeNextPath,
  stashNextPath,
  takeStashedNext,
} from "./authRedirect";

const ORIGIN = "https://books.test";

afterEach(() => window.localStorage.clear());

describe("safeNextPath", () => {
  it("keeps same-origin relative paths incl. query and hash", () => {
    expect(safeNextPath("/friends?add=BR-ABCDE", ORIGIN)).toBe("/friends?add=BR-ABCDE");
  });
  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.com", ORIGIN)).toBe("/");
    expect(safeNextPath("/\\evil.com", ORIGIN)).toBe("/");
    expect(safeNextPath("https://evil.com/x", ORIGIN)).toBe("/");
    expect(safeNextPath(null, ORIGIN)).toBe("/");
  });
});

describe("stashed destination (survives the emailed link opening in a new tab)", () => {
  it("round-trips once, then is consumed", () => {
    stashNextPath("/friends?add=BR-ABCDE");
    expect(takeStashedNext()).toBe("/friends?add=BR-ABCDE");
    expect(takeStashedNext()).toBeNull();
  });
  it("expires after an hour", () => {
    stashNextPath("/clubs");
    expect(takeStashedNext(Date.now() + 61 * 60 * 1000)).toBeNull();
  });
  it("stashing null clears any earlier value", () => {
    stashNextPath("/clubs");
    stashNextPath(null);
    expect(takeStashedNext()).toBeNull();
  });
});

describe("isFreshAccount (welcome onboarding for implicit sign-ups)", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  it("true for a just-created account on its first sign-in", () => {
    expect(isFreshAccount({ created_at: "2026-09-25T11:58:00Z", last_sign_in_at: "2026-09-25T11:58:05Z" }, now)).toBe(true);
  });
  it("false for an old account, or a later sign-in on a young one", () => {
    expect(isFreshAccount({ created_at: "2026-09-20T11:58:00Z", last_sign_in_at: "2026-09-25T11:59:00Z" }, now)).toBe(false);
    expect(isFreshAccount({ created_at: "2026-09-25T11:50:00Z", last_sign_in_at: "2026-09-25T11:59:00Z" }, now)).toBe(false);
  });
  it("false when there is no usable timestamp", () => {
    expect(isFreshAccount({}, now)).toBe(false);
  });
});

describe("parseAuthRedirectError", () => {
  it("reads an expired-link error out of the hash", () => {
    const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    expect(parseAuthRedirectError(hash)).toBe("Email link is invalid or has expired");
  });
  it("returns null when the URL carries no error", () => {
    expect(parseAuthRedirectError("#access_token=abc&type=magiclink")).toBeNull();
    expect(parseAuthRedirectError("")).toBeNull();
  });
});

describe("enabledOAuthProviders (config flag, off by default)", () => {
  it("is empty unless NEXT_PUBLIC_AUTH_PROVIDERS names known providers", () => {
    expect(enabledOAuthProviders(undefined)).toEqual([]);
    expect(enabledOAuthProviders("")).toEqual([]);
    expect(enabledOAuthProviders("github,twitter")).toEqual([]);
    expect(enabledOAuthProviders("Google, apple")).toEqual(["google", "apple"]);
  });
});
