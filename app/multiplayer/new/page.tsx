"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Moved to /new-game/multiplayer — forward old links.
export default function MultiplayerNewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/new-game/multiplayer");
  }, [router]);
  return null;
}
