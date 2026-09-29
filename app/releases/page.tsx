// The full release history, back to day one — reachable from Home's footer
// and from a "release" notification bell item. Metadata shell only; the
// screen itself is ReleasesContent (a Client Component that calls useT()).
// Same split as history/page.tsx + HistoryContent.tsx.

import { BackLink } from "../components/BackLink";
import { routeMetadata } from "../lib/routeMetadata";
import { ReleasesContent } from "./ReleasesContent";

export const metadata = routeMetadata({
  title: "What's New",
  description: "The full release history of Books & Runs, from launch day to today.",
  path: "/releases",
});

export default function ReleasesPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <BackLink href="/" smart />
      <ReleasesContent />
    </main>
  );
}
