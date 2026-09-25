// A static prose page on the history/origins of the Contract Rummy variant
// this game implements. Server component (no "use client") — pure content,
// mainly here for SEO. Not to be confused with the profile page's own game
// history (app/player/page.tsx) or the local device game log.
//
// The actual prose lives in HistoryContent.tsx (a Client Component, so it
// can call useT()) — this file stays a Server Component only so
// `export const metadata` keeps working. Same split as
// app/how-to-play/page.tsx + HowToPlayContent.tsx.

import { BackLink } from "../components/BackLink";
import { HistoryContent } from "./HistoryContent";

// Just the page-specific portion — the root layout's title.template
// ("%s — Books & Runs") appends the suffix automatically; writing it here
// too would double it in the actual browser tab.
export const metadata = {
  title: "History of Books & Runs",
};

export default function HistoryPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <BackLink href="/" />
      <HistoryContent />
    </main>
  );
}
