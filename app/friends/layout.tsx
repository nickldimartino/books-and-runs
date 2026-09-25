import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Friends",
  description: "Add friends by code and invite them to a turn-based game of Books & Runs.",
  path: "/friends",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
