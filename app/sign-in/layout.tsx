import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Sign in",
  description: "Sign in or create a Books & Runs account to save stats, join the leaderboard and play with friends.",
  path: "/sign-in",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
