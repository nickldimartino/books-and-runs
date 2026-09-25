import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Settings",
  description: "Themes, card backs, sound, accessibility and gameplay options for Books & Runs.",
  path: "/settings",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
