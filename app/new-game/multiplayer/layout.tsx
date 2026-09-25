import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "New online game",
  description: "Set up a turn-based online game of Books & Runs with friends.",
  path: "/new-game/multiplayer",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
