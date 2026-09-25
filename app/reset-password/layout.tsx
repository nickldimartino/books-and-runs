import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Reset password",
  description: "Choose a new password for your Books & Runs account.",
  path: "/reset-password",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
