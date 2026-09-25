import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Support",
  description: "Get help with Books & Runs or send feedback to the developer.",
  path: "/support",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
