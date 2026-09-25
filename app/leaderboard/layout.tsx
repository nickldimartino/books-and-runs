import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Leaderboard",
  description: "See how you rank in Books & Runs: overall, this month, and among friends.",
  path: "/leaderboard",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
