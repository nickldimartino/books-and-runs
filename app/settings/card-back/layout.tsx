import { routeMetadata } from "../../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Card back",
  description: "Choose a card back design for Books & Runs.",
  path: "/settings/card-back",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
