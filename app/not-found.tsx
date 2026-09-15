import Link from "next/link";

// Themed 404 for unknown routes — replaces Next's bare white "This page
// could not be found." so a wrong/stale link still lands somewhere that
// looks like the app and offers a way back in.
// Just the page-specific portion — the root layout's title.template
// ("%s — Books & Runs") appends the suffix automatically; writing it here
// too would double it in the actual browser tab.
export const metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">Error 404</p>
      <h1 className="text-2xl font-bold text-[var(--heading)]">This page doesn&apos;t exist</h1>
      <p className="text-sm text-[var(--muted)]">
        The link might be old, or the address has a typo. Everything still works from the home
        screen.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
      >
        Back to Home
      </Link>
    </main>
  );
}
