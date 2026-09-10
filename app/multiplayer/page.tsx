"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The standalone multiplayer hub was folded into the Home screen (active
// games, invites) and the New Game flow (starting one). This route just
// forwards anyone with an old link.
export default function MultiplayerRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
