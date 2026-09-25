import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Scorecard",
  description: "A free scorekeeper for real-life Contract Rummy games: track every player score round by round.",
  path: "/scorecard",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
