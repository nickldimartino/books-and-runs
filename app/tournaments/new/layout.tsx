import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "New tournament",
  description: "Set up a round-robin Books & Runs tournament with friends.",
  path: "/tournaments/new",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
