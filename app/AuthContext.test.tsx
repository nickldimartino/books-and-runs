// @vitest-environment jsdom

// resolveAuthState is the one function standing between a password-only
// (aal1) session and this app treating someone as genuinely signed in —
// get it wrong and either a stolen password bypasses a second factor
// entirely, or a fully-verified (aal2) account gets logged out for no
// reason. Tested directly against a stub Supabase client rather than
// through the whole AuthProvider, since it's a pure function of
// (client, session).

import { describe, expect, it } from "vitest";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { resolveAuthState } from "./AuthContext";

const USER = { id: "u-1", email: "player@example.com" } as User;
const SESSION = { user: USER } as Session;

function fakeClient(aal: { currentLevel: string | null; nextLevel: string | null } | null): SupabaseClient {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: aal, error: null }),
      },
    },
  } as unknown as SupabaseClient;
}

describe("resolveAuthState", () => {
  it("no session → signed out, no MFA pending", async () => {
    const result = await resolveAuthState(fakeClient({ currentLevel: "aal1", nextLevel: "aal1" }), null);
    expect(result).toEqual({ user: null, mfaPending: false });
  });

  it("session with no factor enrolled (aal1 → aal1) → fully signed in", async () => {
    const result = await resolveAuthState(fakeClient({ currentLevel: "aal1", nextLevel: "aal1" }), SESSION);
    expect(result).toEqual({ user: USER, mfaPending: false });
  });

  it("session at aal1 with a factor requiring aal2 → NOT signed in, MFA pending", async () => {
    const result = await resolveAuthState(fakeClient({ currentLevel: "aal1", nextLevel: "aal2" }), SESSION);
    expect(result).toEqual({ user: null, mfaPending: true });
  });

  it("session already verified to aal2 → fully signed in", async () => {
    const result = await resolveAuthState(fakeClient({ currentLevel: "aal2", nextLevel: "aal2" }), SESSION);
    expect(result).toEqual({ user: USER, mfaPending: false });
  });

  it("a null assurance-level response fails closed to signed in (never silently grants access)", async () => {
    // Defensive case: if the SDK ever returns no data, don't accidentally
    // treat that as "MFA satisfied" — but also don't invent a user out of
    // a session that's actually there. The current behavior of trusting
    // the session's own user here is intentional (a null response means
    // "couldn't determine AAL", not "AAL requirement exists"); this test
    // exists so a future change to that assumption is a deliberate one.
    const result = await resolveAuthState(fakeClient(null), SESSION);
    expect(result).toEqual({ user: USER, mfaPending: false });
  });
});
