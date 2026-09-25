import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Tournaments",
  description: "Run a round-robin Books & Runs tournament with friends.",
  path: "/tournaments",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
