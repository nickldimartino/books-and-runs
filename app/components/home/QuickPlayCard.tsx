"use client";

// One-tap "play my usual" right on Home — the saved solo/pass-and-play
// lineup (favoriteGameConfig.ts, set from the New Game setup page) re-dealt
// without walking the form. Mirrors the setup page's own handlePlayFavorite
// exactly, including seat 0 taking the account's *current* display name, so
// the two entry points can't drift.

import { useEffect, useState } from "react";
import { useAuth } from "../../AuthContext";
import { useGame } from "../../GameContext";
import {
  contractsFor,
  describeFavoriteGameConfig,
  FavoriteGameConfig,
  loadFavoriteGameConfigWithCloud,
  playerConfigsFor,
} from "../../lib/favoriteGameConfig";
import { useT } from "../../lib/i18n/LocaleProvider";
import { fetchOwnDisplayName } from "../../lib/leaderboardStore";
import { supabase } from "../../lib/supabaseClient";

export function QuickPlayCard({ onStarted }: { onStarted: () => void }) {
  const { t, tPlural } = useT();
  const { user } = useAuth();
  const { startNewGame } = useGame();
  const [favorite, setFavorite] = useState<FavoriteGameConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFavoriteGameConfigWithCloud(supabase, user?.id ?? null).then((f) => {
      if (!cancelled) setFavorite(f);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!favorite) return null;

  async function play(cfg: FavoriteGameConfig) {
    setBusy(true);
    let humanNames = cfg.humanNames;
    if (supabase && user) {
      try {
        const name = (await fetchOwnDisplayName(supabase, user.id))?.trim();
        humanNames = [name || t("newGame.you"), ...humanNames.slice(1)];
      } catch {
        /* keep the saved name */
      }
    }
    const configs = playerConfigsFor(humanNames.slice(0, cfg.humanCount), cfg.aiDifficulties);
    startNewGame(configs, contractsFor(cfg.roundMode, cfg.customRounds), true);
    onStarted();
  }

  return (
    <section className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-left">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--heading)]">{t("newGame.quickDeal")}</h2>
        <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
          {describeFavoriteGameConfig(favorite, t, tPlural)}
        </p>
      </div>
      <button
        onClick={() => play(favorite)}
        disabled={busy}
        className="shrink-0 rounded-lg border border-[var(--accent)]/50 px-4 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-50"
      >
        {t("newGameLocal.play")}
      </button>
    </section>
  );
}
