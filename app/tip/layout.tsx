import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Support Books & Runs",
  description: "Chip in to keep Books & Runs free and ad-free.",
  path: "/tip",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
