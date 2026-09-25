import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Stats",
  description: "Your Books & Runs stats: games played, wins and best scores.",
  path: "/stats",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
