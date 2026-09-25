// Static terms of service — server component (no "use client"), plain
// prose. Linked from the Home footer and Settings. The actual translated
// prose lives in TermsContent.tsx (a Client Component, since useT() needs
// React Context) — see that file's comment.

import { BackLink } from "../components/BackLink";
import { TermsContent } from "./TermsContent";

// Just the page-specific portion — see not-found.tsx's own comment on why.
export const metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <BackLink href="/" />
      <TermsContent />
    </main>
  );
}
