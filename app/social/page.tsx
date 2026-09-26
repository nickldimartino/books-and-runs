// The Social hub — a tab destination in the app nav. Metadata shell only; the
// screen itself is SocialContent (a Client Component that calls useT()).

import { routeMetadata } from "../lib/routeMetadata";
import { SocialContent } from "./SocialContent";

export const metadata = routeMetadata({
  title: "Social",
  description: "Friends, clubs and tournaments for turn-based games of Books & Runs.",
  path: "/social",
  index: false,
});

export default function SocialPage() {
  return <SocialContent />;
}
