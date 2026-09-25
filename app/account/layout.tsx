import { routeMetadata } from "../lib/routeMetadata";

export const metadata = routeMetadata({
  title: "Account",
  description: "Manage your Books & Runs account: email, password, two-factor sign-in and your data.",
  path: "/account",
  index: false,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
