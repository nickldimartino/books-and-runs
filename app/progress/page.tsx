// The Progress hub — a tab destination in the app nav. Metadata shell only;
// the screen itself is ProgressContent (a Client Component that calls useT()).

import { routeMetadata } from "../lib/routeMetadata";
import { ProgressContent } from "./ProgressContent";

export const metadata = routeMetadata({
  title: "Progress",
  description: "Your level, achievements, stats and leaderboard rank in Books & Runs.",
  path: "/progress",
  index: false,
});

export default function ProgressPage() {
  return <ProgressContent />;
}
