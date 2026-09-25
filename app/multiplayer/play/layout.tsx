import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Multiplayer game",
  description: "A turn-based Books & Runs game.",
  path: "/multiplayer/play",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
