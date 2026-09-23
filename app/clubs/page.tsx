"use client";

// Clubs — "a regular table." A standing named group (a recurring
// pass-and-play/multiplayer crew) with its own roster and a shared
// scoreboard scoped to just that roster, distinct from the global
// leaderboard (see clubsStore.ts's own doc). One page handles both the
// list (no `?id=`) and a single club's detail (`?id=<clubId>`), same
// query-param-routing pattern as /player — a static export has no way to
// generate a page per club id ahead of time.

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import {
  addClubMember,
  ClubStanding,
  ClubSummary,
  createClub,
  deleteClub,
  getClub,
  getClubMemberIds,
  getClubStandings,
  getMyClubs,
  removeClubMember,
  renameClub,
} from "../lib/clubsStore";
import { Friend, getFriends } from "../lib/friendsStore";
import { displayNameFor, playerProfileHref } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

function nameOf(userId: string, displayName: string | null): string {
  return displayNameFor({ user_id: userId, display_name: displayName });
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}

function useClubId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);
  return id;
}

export default function ClubsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const clubId = useClubId();

  if (!authLoading && !configured) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Clubs aren&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
        <Link href="/" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </Shell>
    );
  }

  if (!authLoading && configured && !user) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Sign in for clubs</h1>
        <p className="text-sm text-[var(--muted)]">A club is a standing group tied to your account.</p>
        <Link href="/sign-in" className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]">
          Sign in
        </Link>
        <Link href="/" className="rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          Back to Home
        </Link>
      </Shell>
    );
  }

  if (authLoading || clubId === undefined) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    );
  }

  return clubId ? <ClubDetail clubId={clubId} /> : <ClubList />;
}

function ClubList() {
  const [clubs, setClubs] = useState<ClubSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      setClubs(await getMyClubs(supabase));
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load clubs:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = await createClub(supabase, newName.trim());
      setNewName("");
      window.location.href = `/clubs?id=${id}`;
    } catch (err) {
      console.error("Failed to create club:", err);
      setCreateError("Couldn't create that club — try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">Clubs</h1>

      <PageTip id="clubs" title="A regular table">
        A club is a standing group of friends — your recurring crew. It has its own scoreboard,
        scoped to just that roster, separate from the global leaderboard. You can start a
        tournament from a club&apos;s roster any time from the club page.
      </PageTip>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Club name"
          maxLength={40}
          className="flex-1 rounded-lg bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
      {createError && <p className="text-xs text-[var(--danger)]">{createError}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">Couldn&apos;t load your clubs — check your connection and try again.</p>
      ) : clubs.length === 0 ? (
        <EmptyState icon="♣">No clubs yet — create one above to start a standing group with your friends.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {clubs.map((c) => (
            <li key={c.clubId}>
              <Link
                href={`/clubs?id=${c.clubId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3 transition hover:bg-[var(--panel-soft)]"
              >
                <span className="font-semibold text-[var(--heading)]">{c.name}</span>
                <span className="shrink-0 text-xs text-[var(--faint)]">
                  {c.memberCount} member{c.memberCount === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ClubDetail({ clubId }: { clubId: string }) {
  const { user } = useAuth();
  const [club, setClub] = useState<{ id: string; name: string; ownerId: string } | null | undefined>(undefined);
  const [standings, setStandings] = useState<ClubStanding[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const [c, s, ids, f] = await Promise.all([
        getClub(supabase, clubId),
        getClubStandings(supabase, clubId),
        getClubMemberIds(supabase, clubId),
        getFriends(supabase),
      ]);
      setClub(c);
      setStandings(s);
      setMemberIds(ids);
      setFriends(f);
      setLoadError(false);
    } catch (err) {
      console.error("Failed to load club:", err);
      setLoadError(true);
    }
  }, [clubId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Club not found</h1>
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load it — check your connection and try again.</p>
        <Link href="/clubs" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          ← Clubs
        </Link>
      </Shell>
    );
  }

  if (club === undefined) {
    return (
      <Shell>
        <LoadingSpinner />
      </Shell>
    );
  }

  if (club === null) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Club not found</h1>
        <p className="text-sm text-[var(--muted)]">It may have been deleted, or you&apos;re not a member.</p>
        <Link href="/clubs" className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]">
          ← Clubs
        </Link>
      </Shell>
    );
  }

  const isOwner = club.ownerId === user?.id;
  const addableFriends = friends.filter((f) => !memberIds.includes(f.userId));

  async function handleAdd(friendId: string) {
    if (!supabase) return;
    setBusy(friendId);
    setActionError(null);
    try {
      await addClubMember(supabase, clubId, friendId);
      await load();
    } catch (err) {
      console.error("Failed to add club member:", err);
      setActionError("Couldn't add them — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(memberId: string) {
    if (!supabase) return;
    setBusy(memberId);
    setActionError(null);
    try {
      await removeClubMember(supabase, clubId, memberId);
      if (memberId === user?.id) {
        window.location.href = "/clubs";
        return;
      }
      await load();
    } catch (err) {
      console.error("Failed to remove club member:", err);
      setActionError("Couldn't remove them — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !renameValue.trim()) return;
    setBusy("rename");
    setActionError(null);
    try {
      await renameClub(supabase, clubId, renameValue.trim());
      setRenaming(false);
      await load();
    } catch (err) {
      console.error("Failed to rename club:", err);
      setActionError("Couldn't rename it — try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!supabase) return;
    if (!confirm(`Delete "${club!.name}"? This removes it for everyone.`)) return;
    setBusy("delete");
    setActionError(null);
    try {
      await deleteClub(supabase, clubId);
      window.location.href = "/clubs";
    } catch (err) {
      console.error("Failed to delete club:", err);
      setActionError("Couldn't delete it — try again.");
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/clubs" label="Clubs" />

      {renaming ? (
        <form onSubmit={handleRename} className="flex gap-2">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={40}
            autoFocus
            className="flex-1 rounded-lg bg-[var(--panel)] px-4 py-2 text-xl font-bold text-[var(--heading)] outline-none ring-1 ring-[var(--accent)]"
          />
          <button type="submit" disabled={busy === "rename"} className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]">
            Save
          </button>
          <button type="button" onClick={() => setRenaming(false)} className="shrink-0 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--heading)]">{club.name}</h1>
          {isOwner && (
            <button
              onClick={() => {
                setRenameValue(club!.name);
                setRenaming(true);
              }}
              className="shrink-0 text-xs text-[var(--faint)] underline hover:text-[var(--muted)]"
            >
              Rename
            </button>
          )}
        </div>
      )}

      <Link
        href={`/tournaments/new?club=${clubId}`}
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-center text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
      >
        Start a tournament with this club
      </Link>

      {actionError && <p className="text-xs text-[var(--danger)]">{actionError}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          Standings — multiplayer record
        </h2>
        <ol className="flex flex-col gap-2">
          {standings.map((s, i) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
              <Link href={playerProfileHref(s.userId)} className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--faint)]">{i + 1}.</span>
                <span className="truncate font-medium text-[var(--heading)]">
                  {s.userId === user?.id ? "You" : nameOf(s.userId, s.displayName)}
                </span>
                {s.userId === club.ownerId && (
                  <span className="shrink-0 rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">owner</span>
                )}
              </Link>
              <span className="shrink-0 text-right text-xs text-[var(--muted)]">
                {s.gamesWon}W / {s.gamesPlayed}
                {s.bestWinStreak > 0 && <span className="ml-1 text-[var(--faint)]">· best streak {s.bestWinStreak}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">Members</h2>
        </div>
        <ul className="flex flex-col gap-2">
          {standings.map((s) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2.5 text-sm">
              <span className="truncate text-[var(--text)]">{s.userId === user?.id ? "You" : nameOf(s.userId, s.displayName)}</span>
              {(isOwner && s.userId !== club.ownerId) || (!isOwner && s.userId === user?.id) ? (
                <button
                  onClick={() => handleRemove(s.userId)}
                  disabled={busy === s.userId}
                  className="shrink-0 text-xs text-[var(--danger)] hover:opacity-80 disabled:opacity-50"
                >
                  {s.userId === user?.id ? "Leave" : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="mt-2 flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Add a friend</h3>
            {addableFriends.length === 0 ? (
              <p className="text-xs text-[var(--faint)]">
                Every friend of yours is already in this club, or you have none yet —{" "}
                <Link href="/friends" className="underline">add some</Link>.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {addableFriends.map((f) => (
                  <li key={f.userId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel)] px-4 py-2.5 text-sm">
                    <span className="truncate text-[var(--text)]">{nameOf(f.userId, f.displayName)}</span>
                    <button
                      onClick={() => handleAdd(f.userId)}
                      disabled={busy === f.userId}
                      className="shrink-0 rounded-md bg-[var(--elevated)] px-3 py-1 text-xs font-medium text-[var(--heading)] hover:bg-[var(--elevated-hover)] disabled:opacity-50"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {isOwner && (
        <button onClick={handleDelete} disabled={busy === "delete"} className="self-start text-xs text-[var(--danger)] underline hover:opacity-80 disabled:opacity-50">
          Delete this club
        </button>
      )}
    </main>
  );
}
