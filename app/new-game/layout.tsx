import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "New game",
  description: "Start a game of Books & Runs, the free Contract Rummy card game: solo against AI, pass-and-play, or online with friends.",
  path: "/new-game",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
