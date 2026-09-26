// The Profile hub — a tab destination in the app nav. Metadata shell only; the
// screen itself is ProfileContent (a Client Component that calls useT()).

import { routeMetadata } from "../lib/routeMetadata";
import { ProfileContent } from "./ProfileContent";

export const metadata = routeMetadata({
  title: "Profile",
  description: "Your profile, account and settings, plus help and about links for Books & Runs.",
  path: "/profile",
  index: false,
});

export default function ProfilePage() {
  return <ProfileContent />;
}
