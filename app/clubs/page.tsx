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
import { CenteredMessage } from "../components/CenteredMessage";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { useT } from "../lib/i18n/LocaleProvider";
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
import { nameOf, playerProfileHref } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

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
  const { t } = useT();

  if (!authLoading && !configured) {
    return <CenteredMessage title={t("clubs.notSetUp.title")} body={t("clubs.notSetUp.body")} />;
  }

  if (!authLoading && configured && !user) {
    return <CenteredMessage title={t("clubs.signInTitle")} body={t("clubs.signInBody")} signIn />;
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
  const { t, tPlural } = useT();
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
      setCreateError(t("clubs.createError"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("clubs.title")}</h1>

      <PageTip id="clubs" title={t("clubs.tip.title")}>
        {t("clubs.tip.body")}
      </PageTip>

      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("clubs.namePlaceholder")}
          maxLength={40}
          className="flex-1 rounded-lg bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--text)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="shrink-0 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {creating ? t("clubs.creating") : t("clubs.create")}
        </button>
      </form>
      {createError && <p className="text-xs text-[var(--danger)]">{createError}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">{t("clubs.loadError")}</p>
      ) : clubs.length === 0 ? (
        <EmptyState icon="♣">{t("clubs.empty")}</EmptyState>
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
                  {tPlural("clubs.memberCount", c.memberCount)}
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
  const { t } = useT();
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
      <CenteredMessage
        title={t("clubs.notFound.title")}
        body={t("clubs.notFound.loadErrorBody")}
        backHref="/clubs"
        backLabel={t("clubs.backToClubs")}
      />
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
      <CenteredMessage
        title={t("clubs.notFound.title")}
        body={t("clubs.notFound.deletedBody")}
        backHref="/clubs"
        backLabel={t("clubs.backToClubs")}
      />
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
      setActionError(t("clubs.addMemberError"));
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
      setActionError(t("clubs.removeMemberError"));
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
      setActionError(t("clubs.renameError"));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!supabase) return;
    if (!confirm(t("clubs.confirmDelete", { name: club!.name }))) return;
    setBusy("delete");
    setActionError(null);
    try {
      await deleteClub(supabase, clubId);
      window.location.href = "/clubs";
    } catch (err) {
      console.error("Failed to delete club:", err);
      setActionError(t("clubs.deleteError"));
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/clubs" label={t("clubs.title")} />

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
            {t("common.save")}
          </button>
          <button type="button" onClick={() => setRenaming(false)} className="shrink-0 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
            {t("common.cancel")}
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
              {t("clubs.rename")}
            </button>
          )}
        </div>
      )}

      <Link
        href={`/tournaments/new?club=${clubId}`}
        className="rounded-lg bg-[var(--accent)] px-6 py-3 text-center text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
      >
        {t("clubs.startTournament")}
      </Link>

      {actionError && <p className="text-xs text-[var(--danger)]">{actionError}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
          {t("clubs.standingsHeading")}
        </h2>
        <ol className="flex flex-col gap-2">
          {standings.map((s, i) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3">
              <Link href={playerProfileHref(s.userId)} className="flex min-w-0 items-center gap-2">
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--faint)]">{i + 1}.</span>
                <span className="truncate font-medium text-[var(--heading)]">
                  {s.userId === user?.id ? t("gameOver.you") : nameOf(s.userId, s.displayName)}
                </span>
                {s.userId === club.ownerId && (
                  <span className="shrink-0 rounded-full bg-[var(--panel-soft)] px-1.5 py-0.5 text-[10px] text-[var(--faint)]">{t("clubs.ownerBadge")}</span>
                )}
              </Link>
              <span className="shrink-0 text-right text-xs text-[var(--muted)]">
                {t("clubs.record", { won: s.gamesWon, played: s.gamesPlayed })}
                {s.bestWinStreak > 0 && (
                  <span className="ml-1 text-[var(--faint)]">· {t("clubs.bestStreak", { count: s.bestWinStreak })}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">{t("clubs.membersHeading")}</h2>
        </div>
        <ul className="flex flex-col gap-2">
          {standings.map((s) => (
            <li key={s.userId} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel-soft)] px-4 py-2.5 text-sm">
              <span className="truncate text-[var(--text)]">{s.userId === user?.id ? t("gameOver.you") : nameOf(s.userId, s.displayName)}</span>
              {(isOwner && s.userId !== club.ownerId) || (!isOwner && s.userId === user?.id) ? (
                <button
                  onClick={() => handleRemove(s.userId)}
                  disabled={busy === s.userId}
                  className="shrink-0 text-xs text-[var(--danger)] hover:opacity-80 disabled:opacity-50"
                >
                  {s.userId === user?.id ? t("clubs.leave") : t("common.remove")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="mt-2 flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("clubs.addFriendHeading")}</h3>
            {addableFriends.length === 0 ? (
              <p className="text-xs text-[var(--faint)]">
                {t("clubs.noAddableFriendsPrefix")}{" "}
                <Link href="/friends" className="underline">{t("clubs.addSome")}</Link>.
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
                      {t("clubs.add")}
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
          {t("clubs.deleteClub")}
        </button>
      )}
    </main>
  );
}
