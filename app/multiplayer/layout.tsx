import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Multiplayer",
  description: "Your turn-based Books & Runs games with friends.",
  path: "/multiplayer",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
