"use client";

// "Find an opponent" — the one way into multiplayer that needs no friend
// on the other end (migration 0098). Every other path (invite a friend,
// play AI) already existed; a friendless new player could never actually
// try the headline multiplayer feature.
//
// joinMatchmaking() is designed to be safely re-callable: each call both
// tries to find a fresh match AND reports whether one already landed, so
// polling it on an interval is both the "search" and the "check status"
// step at once — no separate status endpoint needed.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { joinMatchmaking, leaveMatchmaking, MpError } from "../lib/mpStore";
import { useT } from "../lib/i18n/LocaleProvider";
import { supabase } from "../lib/supabaseClient";
import { translateError } from "../lib/i18n/serverErrors";

const POLL_MS = 3000;

export function MatchmakingCard() {
  const { t } = useT();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!searching || !supabase) return;
    cancelledRef.current = false;

    async function poll() {
      if (!supabase || cancelledRef.current) return;
      try {
        const res = await joinMatchmaking(supabase);
        if (cancelledRef.current) return;
        if (res.status === "matched") {
          router.push(`/multiplayer/play?g=${res.game_id}`);
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        setError(err instanceof MpError ? translateError(err.message, t) : t("matchmaking.error"));
        setSearching(false);
        return;
      }
      if (!cancelledRef.current) timer = setTimeout(poll, POLL_MS);
    }
    let timer: ReturnType<typeof setTimeout>;
    poll();
    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  // Leaving the queue on unmount too (navigating away mid-search) — not
  // just on the Cancel button — so a player who backs out doesn't stay
  // occupying a queue slot nobody else can see or clear.
  useEffect(() => {
    return () => {
      if (searching && supabase) void leaveMatchmaking(supabase);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCancel() {
    setSearching(false);
    if (supabase) void leaveMatchmaking(supabase);
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
      <h2 className="text-sm font-semibold text-[var(--heading)]">{t("matchmaking.title")}</h2>
      <p className="text-xs text-[var(--muted)]">{t("matchmaking.body")}</p>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      {searching ? (
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" aria-hidden="true" />
            {t("matchmaking.searching")}
          </p>
          <button
            onClick={handleCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            setError(null);
            setSearching(true);
          }}
          className="self-start rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          {t("matchmaking.find")}
        </button>
      )}
    </section>
  );
}
