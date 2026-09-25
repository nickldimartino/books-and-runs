import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "New solo or pass-and-play game",
  description: "Set up a solo or pass-and-play game of Books & Runs: choose opponents, difficulty and rounds.",
  path: "/new-game/local",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
