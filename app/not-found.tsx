import { NotFoundContent } from "./components/NotFoundContent";

// Themed 404 for unknown routes — replaces Next's bare white "This page
// could not be found." so a wrong/stale link still lands somewhere that
// looks like the app and offers a way back in.
// Just the page-specific portion — the root layout's title.template
// ("%s — Books & Runs") appends the suffix automatically; writing it here
// too would double it in the actual browser tab. The visible copy lives in
// a Client Component so it can use useT() (this file stays a Server
// Component for `metadata`).
export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return <NotFoundContent />;
}
