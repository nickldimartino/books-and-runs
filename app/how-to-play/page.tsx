// The rules reference. Mostly static prose (server component) driven off
// CONTRACTS for the round table, so the listed contracts can never drift
// from what the engine actually deals. The back link is a client component
// (BackLink.tsx) that returns you to wherever you came from — Home, or the
// game if you arrived via `?from=game`.

import { HowToPlayBottomBackLink, HowToPlayTopBackLink } from "./BackLink";
import { HowToPlayContent } from "./HowToPlayContent";

// Just the page-specific portion — see app/not-found.tsx's own comment on
// why (the root layout's title.template appends the suffix automatically).
export const metadata = {
  title: "How to Play",
};

export default function HowToPlayPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <HowToPlayTopBackLink />
      <HowToPlayContent />
      <HowToPlayBottomBackLink />
    </main>
  );
}
