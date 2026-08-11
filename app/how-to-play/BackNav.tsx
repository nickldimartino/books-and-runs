"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackNav() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.back()}
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Back
      </button>
      <Link
        href="/"
        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        Home
      </Link>
    </div>
  );
}
