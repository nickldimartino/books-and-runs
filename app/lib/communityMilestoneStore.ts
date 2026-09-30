"use client";

// The community milestone (migration 0096, reward switched to XP by 0100 —
// goals never hand out free Boutique items) — a rare, site-wide goal every
// account contributes to just by playing, distinct from a per-account or
// per-club goal. Public data (no account tie), read via
// community_milestone_progress() (security definer, granted to anon too —
// a guest can see the goal without signing in). Granting the reward once
// the target is met happens server-side (a daily cron calling
// check_and_grant_community_milestone(), see daily-deal-reminder) — this
// file only ever reads.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CommunityMilestone {
  id: number;
  metric: string;
  currentCount: number;
  target: number;
  rewardXp: number;
  reachedAt: string | null;
}

interface MilestoneRow {
  id: number;
  metric: string;
  current_count: number;
  target: number;
  reward_xp: number;
  reached_at: string | null;
}

/** Null when every seeded milestone has already been reached (nothing left
 * to show), not just when the fetch fails. */
export async function getCommunityMilestone(supabase: SupabaseClient | null): Promise<CommunityMilestone | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("community_milestone_progress");
  if (error) throw error;
  const row = ((data as MilestoneRow[]) ?? [])[0];
  if (!row) return null;
  return {
    id: row.id,
    metric: row.metric,
    currentCount: row.current_count,
    target: row.target,
    rewardXp: row.reward_xp,
    reachedAt: row.reached_at,
  };
}
