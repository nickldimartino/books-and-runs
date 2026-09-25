import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Achievements",
  description: "Track your Books & Runs achievements, from your first win to the rarest badges.",
  path: "/achievements",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
