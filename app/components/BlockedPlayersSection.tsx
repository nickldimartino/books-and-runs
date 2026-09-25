"use client";

// Account page → "Blocked players": review and undo blocks (migration 0060).

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { useT } from "../lib/i18n/LocaleProvider";
import { nameOf } from "../lib/leaderboardStore";
import { BlockedUser, getMyBlocks, unblockUser } from "../lib/safetyStore";
import { supabase } from "../lib/supabaseClient";

export function BlockedPlayersSection() {
  const { t } = useT();
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      setBlocks(await getMyBlocks(supabase));
      setFailed(false);
    } catch (err) {
      console.error("Failed to load blocked players:", err);
      setFailed(true);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  async function unblock(id: string) {
    if (!supabase) return;
    setBusyId(id);
    try {
      await unblockUser(supabase, id);
      await load();
    } catch (err) {
      console.error("Failed to unblock:", err);
    } finally {
      setBusyId(null);
    }
  }

  // Hidden until 0060 exists / while loading, and when there's nothing to show.
  if (failed || !blocks) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
        {t("safety.blocked.heading")}
      </h2>
      {blocks.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{t("safety.blocked.empty")}</p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted)]">{t("safety.blocked.description")}</p>
          <ul className="flex flex-col gap-2">
            {blocks.map((b) => (
              <li
                key={b.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm"
              >
                <span className="truncate text-[var(--heading)]">{nameOf(b.userId, b.displayName)}</span>
                <button
                  onClick={() => unblock(b.userId)}
                  disabled={busyId === b.userId}
                  className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                >
                  {t("safety.blocked.unblock")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
