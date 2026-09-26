// @vitest-environment jsdom

// Passwordless sign-in: emailed link / 6-digit code, the stashed `?next=`
// (an emailed link can open in another tab), implicit new-account
// onboarding, and the OAuth buttons staying hidden unless configured.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), usePathname: () => "/sign-in" }));

const auth = {
  configured: true,
  loading: false,
  user: null as unknown,
  mfaPending: false,
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithEmailLink: vi.fn(),
  verifyEmailCode: vi.fn(),
  signInWithOAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyMfaCode: vi.fn(),
};
vi.mock("../AuthContext", () => ({ useAuth: () => auth }));

import SignInPage from "./page";

beforeEach(() => {
  replace.mockClear();
  auth.user = null;
  auth.signInWithEmailLink.mockReset().mockResolvedValue({ error: null });
  auth.verifyEmailCode.mockReset().mockResolvedValue({ error: null });
  window.history.replaceState(null, "", "/sign-in?next=%2Ffriends%3Fadd%3DBR-ABCDE");
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("magic link", () => {
  it("asks for an email first, then sends the link and shows the code step", async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    expect(screen.getByText(/enter your email address first/i)).toBeTruthy();
    expect(auth.signInWithEmailLink).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText(/email/i), "nick@example.com");
    await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    await waitFor(() => expect(auth.signInWithEmailLink).toHaveBeenCalledWith("nick@example.com"));
    expect(await screen.findByText(/we sent a sign-in link to nick@example.com/i)).toBeTruthy();
    // the destination is stashed for the link opening elsewhere
    expect(window.localStorage.getItem("booksAndRuns:authNext")).toContain("/friends?add=BR-ABCDE");

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    await waitFor(() => expect(auth.verifyEmailCode).toHaveBeenCalledWith("nick@example.com", "123456"));
  });

  it("maps a provider error through the translated error table", async () => {
    auth.signInWithEmailLink.mockResolvedValue({ error: "Email rate limit exceeded" });
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.type(screen.getByPlaceholderText(/email/i), "nick@example.com");
    await user.click(screen.getByRole("button", { name: /email me a sign-in link/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
  });
});

describe("returning from the link", () => {
  it("shows a translated message for an expired link in the URL hash", () => {
    window.history.replaceState(null, "", "/sign-in#error=access_denied&error_description=Email+link+is+invalid+or+has+expired");
    render(<SignInPage />);
    expect(screen.getByText(/invalid or has expired/i)).toBeTruthy();
  });

  it("a brand-new account (created by the link) gets the welcome onboarding flag and lands on the stashed page", () => {
    window.history.replaceState(null, "", "/sign-in"); // link reopened without ?next=
    window.localStorage.setItem("booksAndRuns:authNext", JSON.stringify({ next: "/clubs", at: Date.now() }));
    const now = new Date().toISOString();
    auth.user = { id: "u", created_at: now, last_sign_in_at: now };
    render(<SignInPage />);
    expect(window.localStorage.getItem("booksAndRuns:justSignedUp")).toBe("1");
    expect(replace).toHaveBeenCalledWith("/clubs");
  });

  it("an existing account does not get the onboarding flag", () => {
    auth.user = { id: "u", created_at: "2025-01-01T00:00:00Z", last_sign_in_at: new Date().toISOString() };
    render(<SignInPage />);
    expect(window.localStorage.getItem("booksAndRuns:justSignedUp")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/friends?add=BR-ABCDE");
  });
});

describe("OAuth", () => {
  it("shows no provider buttons unless NEXT_PUBLIC_AUTH_PROVIDERS enables them", () => {
    render(<SignInPage />);
    expect(screen.queryByRole("button", { name: /continue with/i })).toBeNull();
  });
});
