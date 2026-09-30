// "Your Recap" — a Progress-hub screen adding up everything an account has
// actually done. Metadata shell only; the screen itself is RecapContent (a
// Client Component that calls useT()).

import { routeMetadata } from "../lib/routeMetadata";
import { RecapContent } from "./RecapContent";

export const metadata = routeMetadata({
  title: "Your Recap",
  description: "Everything you've done so far in Books & Runs — games, achievements, streaks and more.",
  path: "/recap",
  index: false,
});

export default function RecapPage() {
  return <RecapContent />;
}
