import { ReactNode } from "react";

// The "nothing here yet" card — an icon, a short explanation, and
// optionally a way to fix that (usually a Link styled as a button). One
// shared shape so a brand-new account sees the same tone everywhere it
// lands on an empty list (Leaderboard, Stats, Friends), instead of each
// page inventing its own bare sentence.
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <span className="text-2xl" aria-hidden="true">
        {icon}
      </span>
      <p className="max-w-sm text-sm text-[var(--faint)]">{children}</p>
      {action}
    </div>
  );
}
