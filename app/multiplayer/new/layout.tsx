import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "New multiplayer game",
  description: "Start a turn-based Books & Runs game with friends.",
  path: "/multiplayer/new",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
