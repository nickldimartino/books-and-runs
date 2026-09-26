"use client";

// Feeds lib/navTrail.ts on every client-side route change (see there).

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordPath } from "../lib/navTrail";

export function NavTrailTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordPath(pathname);
  }, [pathname]);
  return null;
}
