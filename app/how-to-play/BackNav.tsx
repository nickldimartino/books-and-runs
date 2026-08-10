"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackNav() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => router.back()}
        className="rounded-lg border border-emerald-100/20 px-3 py-1.5 text-xs font-medium text-emerald-100/80 hover:bg-emerald-900/40"
      >
        ← Back
      </button>
      <Link
        href="/"
        className="rounded-lg border border-emerald-100/20 px-3 py-1.5 text-xs font-medium text-emerald-100/80 hover:bg-emerald-900/40"
      >
        Home
      </Link>
    </div>
  );
}
