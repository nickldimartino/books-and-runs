import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Card face",
  description: "Choose a card face style for Books & Runs.",
  path: "/settings/card-face",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
