import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Clubs",
  description: "Start or join a Books & Runs club and climb the standings with friends.",
  path: "/clubs",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
