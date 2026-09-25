import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Theme",
  description: "Choose a table theme for Books & Runs.",
  path: "/settings/theme",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
