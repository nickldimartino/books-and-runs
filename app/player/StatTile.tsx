// Shared by page.tsx's own public stat row/head-to-head block and
// PlayerStatsSection's private stats — one small tile, reused rather than
// defined twice and left to drift.
export function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  /** Extra classes on the outer tile — used to give a tile an explicit
   * width in a flex-wrap layout (see the public stat row below), where a
   * plain grid would leave a partial last row hugging the left edge
   * instead of centered. */
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-center ${className ?? ""}`}>
      <p className="text-lg font-bold tabular-nums text-[var(--heading)]">{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--faint)]">{sub}</p>}
    </div>
  );
}
