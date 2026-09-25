import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Player profile",
  description: "A Books & Runs player profile: level, achievements and stats.",
  path: "/player",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
