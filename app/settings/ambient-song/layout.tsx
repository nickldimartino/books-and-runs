import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Ambient music",
  description: "Choose the background music for Books & Runs.",
  path: "/settings/ambient-song",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
