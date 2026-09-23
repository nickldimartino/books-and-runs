"use client";

import Link from "next/link";
import { ReactNode } from "react";

// The centered "this needs X" screen — a heading, optional body text, an
// optional "Sign in" CTA, and a trailing way back — copy-pasted (often via
// each page's own local `Shell` wrapper reinventing the same className) into
// 13+ pages: the "Supabase isn't configured" gate, the "sign in to see this"
// gate, and a couple of one-off empty/error states (e.g. player/page.tsx's
// "No profile to show") that happen to want the exact same shell.
const HEADING = "text-2xl font-bold text-[var(--heading)]";
const BODY = "text-sm text-[var(--muted)]";
const PRIMARY =
  "rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]";
const SECONDARY =
  "rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]";

interface CenteredMessageProps {
  title: string;
  body?: ReactNode;
  /** Adds a "Sign in" primary CTA above the back link. `true` links to the
   * default /sign-in; pass a string instead for a custom destination (e.g.
   * with its own `?next=` to return here after signing in). */
  signIn?: boolean | string;
  /** The trailing CTA — defaults to a "Back to Home" link to "/". Pass
   * `backOnClick` instead of relying on `backHref` for the couple of pages
   * that need `router.replace()` rather than a plain navigation (sign-in
   * and reset-password's own "not configured" gate, so a signed-out visitor
   * can't navigate *back* into the same dead end). */
  backHref?: string;
  backLabel?: string;
  backOnClick?: () => void;
}

export function CenteredMessage({
  title,
  body,
  signIn,
  backHref = "/",
  backLabel = "Back to Home",
  backOnClick,
}: CenteredMessageProps) {
  const signInHref = typeof signIn === "string" ? signIn : "/sign-in";
  // Whichever CTA renders first gets the extra breathing room above it (the
  // parent's own gap-4 handles spacing between two CTAs) — matches every
  // hand-written version of this screen, which only ever added `mt-2` to
  // its first button/link after the body text.
  const backClassName = signIn ? SECONDARY : `mt-2 ${SECONDARY}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className={HEADING}>{title}</h1>
      {body && <p className={BODY}>{body}</p>}
      {signIn && (
        <Link href={signInHref} className={`mt-2 ${PRIMARY}`}>
          Sign in
        </Link>
      )}
      {backOnClick ? (
        <button onClick={backOnClick} className={backClassName}>
          {backLabel}
        </button>
      ) : (
        <Link href={backHref} className={backClassName}>
          {backLabel}
        </Link>
      )}
    </main>
  );
}
