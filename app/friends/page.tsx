"use client";

// Friends page. The friend list, incoming/outgoing requests (accept/deny),
// this account's own friend code + a Share action, and handling of an
// incoming share link (`/friends?add=BR-XXXXX` → resolve the code → one tap
// creates an already-accepted friendship both ways via addFriendByCode).
// Signed-out visitors on a share link are routed through /sign-in?next=…
// and land back here.

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { CenteredMessage } from "../components/CenteredMessage";
import { EmptyState } from "../components/EmptyState";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { PageTip } from "../components/PageTip";
import { PlayerAvatar } from "../components/PlayerAvatar";
import { SafetyMenu } from "../components/SafetyMenu";
import {
  addFriendByCode,
  Friend,
  FriendRequest,
  getFriendRequests,
  getFriends,
  getMyFriendCode,
  lookupFriendCode,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "../lib/friendsStore";
import { AvatarInfo, fetchAvatarsFor, LeaderboardEntry, nameOf, playerProfileHref } from "../lib/leaderboardStore";
import { usePlayerLevel } from "../PlayerLevelContext";
import { buildProfileShareCardInput } from "../lib/profileShareCard";
import { renderProfileShareCard } from "../lib/shareCard";
import { supabase } from "../lib/supabaseClient";
import { translateError } from "../lib/i18n/serverErrors";
import { useT } from "../lib/i18n/LocaleProvider";

type AddState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string }
  | { kind: "sent"; name: string }
  | { kind: "accepted"; name: string };

type InviteLink =
  | { kind: "idle" }
  | { kind: "resolving" }
  | { kind: "prompt"; name: string }
  | { kind: "adding" }
  | { kind: "done"; name: string }
  | { kind: "self" }
  | { kind: "already"; name: string }
  | { kind: "invalid" };

export default function FriendsPage() {
  const { configured, loading: authLoading, user } = useAuth();
  const { level } = usePlayerLevel();
  const { t } = useT();

  const [code, setCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [avatars, setAvatars] = useState<Record<string, AvatarInfo>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Own profile data, fetched only for the "share to add me" card below —
  // null for a brand-new account with no leaderboard_entries row yet
  // (never finished a tracked game or Daily Deal), in which case shareCode
  // falls back to a plain-text share instead of a picture.
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [addState, setAddState] = useState<AddState>({ kind: "idle" });
  const [shareState, setShareState] = useState<"idle" | "shared" | "copied" | "error">("idle");
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The ?add=CODE flow from a shared link.
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkInvite, setLinkInvite] = useState<InviteLink>({ kind: "idle" });

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const [c, f, r] = await Promise.all([
        getMyFriendCode(supabase),
        getFriends(supabase),
        getFriendRequests(supabase),
      ]);
      setCode(c);
      setFriends(f);
      setRequests(r);
      setLoadError(false);
      // The friend RPCs' own left-join only returns display_name — a
      // separate bulk read of the public leaderboard_entries table (same
      // shape as fetchBiosFor) is what fills in avatars for everyone shown
      // here, without needing to touch the RPCs themselves.
      const ids = [...new Set([...f.map((x) => x.userId), ...r.map((x) => x.otherUserId)])];
      fetchAvatarsFor(supabase, ids)
        .then(setAvatars)
        .catch((err) => console.error("Failed to load friend avatars:", err));
    } catch (err) {
      console.error("Failed to load friends:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Own profile data for the share card — separate from load() above since
  // a failure here shouldn't block the friend list/requests from showing,
  // it only means shareCode() falls back to a plain-text share.
  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    (async () => {
      try {
        const { data, error } = await client.from("leaderboard_entries").select("*").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        setMyEntry(data as LeaderboardEntry | null);
      } catch (err) {
        console.error("Failed to load your own profile card data:", err);
      }
    })();
  }, [user]);

  // Pick up ?add=CODE from a shared friend link (once, on mount).
  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get("add");
    if (add) setLinkCode(add.trim().toUpperCase());
  }, []);

  // Resolve the shared code to a name once we know who's signed in and have
  // the current friends list to check against.
  useEffect(() => {
    if (!supabase || !user || !linkCode || loading) return;
    if (linkInvite.kind !== "idle") return;
    setLinkInvite({ kind: "resolving" });
    lookupFriendCode(supabase, linkCode)
      .then((match) => {
        if (!match) return setLinkInvite({ kind: "invalid" });
        if (match.userId === user.id) return setLinkInvite({ kind: "self" });
        const name = nameOf(match.userId, match.displayName);
        if (friends.some((f) => f.userId === match.userId)) {
          return setLinkInvite({ kind: "already", name });
        }
        setLinkInvite({ kind: "prompt", name });
      })
      .catch(() => setLinkInvite({ kind: "invalid" }));
  }, [user, linkCode, loading, linkInvite.kind, friends]);

  async function acceptLink() {
    if (!supabase || !linkCode) return;
    setLinkInvite({ kind: "adding" });
    try {
      const res = await addFriendByCode(supabase, linkCode);
      setLinkInvite({ kind: "done", name: nameOf(res.userId, res.displayName) });
      window.history.replaceState(null, "", "/friends");
      await load();
    } catch (err) {
      console.error("Failed to accept friend link:", err);
      setLinkInvite({ kind: "invalid" });
    }
  }

  useEffect(() => {
    if (!supabase || !user) {
      setLoading(false);
      return;
    }
    load();
    const channel = supabase
      .channel(`friends-page-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mp_events", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => load())
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [user, load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const raw = codeInput.trim();
    if (!raw) return;
    setAddState({ kind: "working" });
    try {
      const match = await lookupFriendCode(supabase, raw);
      if (!match) {
        setAddState({ kind: "error", message: t("friends.errors.noSuchCode") });
        return;
      }
      if (match.userId === user?.id) {
        setAddState({ kind: "error", message: t("friends.errors.ownCode") });
        return;
      }
      const alreadyFriend = friends.some((f) => f.userId === match.userId);
      if (alreadyFriend) {
        setAddState({
          kind: "error",
          message: t("friends.errors.alreadyFriends", { name: nameOf(match.userId, match.displayName) }),
        });
        return;
      }
      const incoming = requests.find((r) => r.direction === "incoming" && r.otherUserId === match.userId);
      await sendFriendRequest(supabase, match.userId);
      setCodeInput("");
      setAddState(
        incoming
          ? { kind: "accepted", name: nameOf(match.userId, match.displayName) }
          : { kind: "sent", name: nameOf(match.userId, match.displayName) }
      );
      load();
    } catch (err) {
      console.error("Friend request failed:", err);
      // A blocked/blocking pair surfaces the server's own (mapped) message;
      // any other failure stays the generic line. (PostgrestError isn't an
      // Error instance, hence the structural read.)
      const raw = (err as { message?: string } | null)?.message ?? "";
      setAddState({ kind: "error", message: /connect with this player/i.test(raw) ? translateError(raw, t) : t("friends.errors.sendFailed") });
    }
  }

  async function respond(id: string, accept: boolean) {
    if (!supabase) return;
    setBusyId(id);
    try {
      await respondToFriendRequest(supabase, id, accept);
      await load();
    } catch (err) {
      console.error("Failed to respond to request:", err);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOrRemove(otherUserId: string) {
    if (!supabase) return;
    setBusyId(otherUserId);
    try {
      await removeFriend(supabase, otherUserId);
      await load();
    } catch (err) {
      console.error("Failed to remove:", err);
    } finally {
      setBusyId(null);
    }
  }

  function copyCode() {
    if (!code || !navigator.clipboard) return;
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {}
    );
  }

/** Plain-text fallback for shareCode() below — used when there's no
 * profile card data to draw yet (a brand-new account, or the fetch above
 * failed), so "add me" still works even with nothing to show off. */
  async function shareCodeAsText() {
    if (!code) return;
    const url = `${window.location.origin}/friends?add=${code}`;
    // One combined string in `text`, and deliberately NO separate `url`
    // field: when navigator.share gets both, several iOS share targets
    // paste the link twice — once appended to the text, once as the
    // attached URL. Keeping it all in `text` means exactly one link, and
    // messaging apps still linkify it.
    const message = t("friends.shareMessage", { code, url });
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2000);
      } catch {
        /* user cancelled the sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(message);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  /** The same profile card shareProfileCard() (player/page.tsx) produces —
   * one polished "add me" surface instead of two differently-shaped ones
   * (see this file's own doc for why that used to feel disconnected: a
   * shared profile link already opens a page with a real "Add friend"
   * button on it, so the two mechanisms were always doing the same job,
   * just looking nothing alike). The raw code + "Copy code" button below
   * stay as-is — the one way to add someone with zero network involved,
   * e.g. reading it aloud across a table, which a picture can't replace. */
  async function shareCode() {
    if (!code || !user) return;
    if (!myEntry) {
      await shareCodeAsText();
      return;
    }
    const url = `${window.location.origin}/friends?add=${code}`;
    try {
      // Re-fetch this account's own row instead of trusting `myEntry`,
      // which was only ever fetched once on mount — a share should always
      // reflect whatever's actually saved, not a page-load snapshot.
      let freshEntry = myEntry;
      if (supabase) {
        const { data } = await supabase.from("leaderboard_entries").select("*").eq("user_id", user.id).maybeSingle();
        if (data) freshEntry = data as LeaderboardEntry;
      }
      const blob = await renderProfileShareCard(
        buildProfileShareCardInput(
          supabase,
          freshEntry,
          level?.level ?? freshEntry.level ?? 0,
          t,
          t("friends.shareCard.footer", { code })
        )
      );
      if (!blob) throw new Error("Canvas unavailable");
      const file = new File([blob], "books-and-runs-add-me.png", { type: "image/png" });
      // One share action carries the picture and the link together — no
      // separate clipboard copy. Only add `url` when canShare confirms the
      // combined payload works; a couple of real devices have been seen
      // silently dropping the picture when a bare `url` rides along with
      // `files` outside that check.
      if (navigator.share && navigator.canShare?.({ files: [file], url })) {
        await navigator.share({ files: [file], url });
      } else if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const objUrl = URL.createObjectURL(blob);
        window.open(objUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
        // No native share sheet here to hand the link to alongside the
        // picture — copying it is the closest one-action equivalent.
        try {
          await navigator.clipboard?.writeText(t("friends.shareMessage", { code, url }));
        } catch {
          // Best-effort — the picture still opened either way.
        }
      }
      setShareState("shared");
      setTimeout(() => setShareState("idle"), 4000);
    } catch (err) {
      console.error("Failed to share profile card:", err);
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  if (!authLoading && !configured) {
    return <CenteredMessage title={t("friends.notConfigured.title")} body={t("friends.notConfigured.body")} />;
  }

  if (!authLoading && configured && !user) {
    const signInHref = linkCode
      ? `/sign-in?next=${encodeURIComponent(`/friends?add=${linkCode}`)}`
      : "/sign-in";
    return (
      <CenteredMessage
        title={linkCode ? t("friends.signInGate.linkTitle") : t("friends.signInGate.title")}
        body={
          linkCode
            ? t("friends.signInGate.linkBody")
            : t("friends.signInGate.body")
        }
        signIn={signInHref}
      />
    );
  }

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <BackLink href="/" />

      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("home.progressTile.friends")}</h1>

      <PageTip id="friends" title={t("friends.tip.title")}>
        {t("friends.tip.body")}
      </PageTip>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">{t("friends.loadError")}</p>
      ) : (
        <>
          {/* Shared friend link (?add=CODE) */}
          {linkInvite.kind === "prompt" && (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <p className="text-sm text-[var(--heading)]">
                {t("friends.link.addPrompt.prefix")}{" "}
                <strong className="font-semibold">{linkInvite.name}</strong>{" "}
                {t("friends.link.addPrompt.suffix")}
              </p>
              <button
                onClick={acceptLink}
                className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
              >
                {t("friends.link.addFriend")}
              </button>
            </section>
          )}
          {linkInvite.kind === "adding" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              {t("friends.link.adding")}
            </section>
          )}
          {linkInvite.kind === "done" && (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-sm text-[var(--accent)]">
              {t("friends.link.done.prefix")}{" "}
              <strong className="font-semibold">{linkInvite.name}</strong>{" "}
              {t("friends.link.done.suffix")}
            </section>
          )}
          {linkInvite.kind === "already" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              {t("friends.link.already.prefix")}{" "}
              <strong className="font-semibold">{linkInvite.name}</strong>
              {t("friends.link.already.suffix")}
            </section>
          )}
          {linkInvite.kind === "self" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              {t("friends.link.self")}
            </section>
          )}
          {linkInvite.kind === "invalid" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--danger)]">
              {t("friends.link.invalid")}
            </section>
          )}

          {/* Your code */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("friends.yourCode.heading")}</h2>
            <p className="mt-1 text-xs text-[var(--faint)]">
              {myEntry ? t("friends.yourCode.descriptionWithCard") : t("friends.yourCode.description")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="select-all font-mono text-2xl font-bold tracking-widest text-[var(--heading)]">
                {code}
              </span>
              <button
                onClick={shareCode}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
              >
                {shareState === "shared" || shareState === "copied"
                  ? t("friends.yourCode.shared")
                  : shareState === "error"
                    ? t("friends.yourCode.shareFailed")
                    : t("friends.yourCode.share")}
              </button>
              <button
                onClick={copyCode}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                {copied ? t("friends.yourCode.copied") : t("friends.yourCode.copyCode")}
              </button>
            </div>
          </section>

          {/* Add a friend */}
          <section className="rounded-xl border border-[var(--border)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("friends.addFriend.heading")}</h2>
            <form onSubmit={handleAdd} className="mt-2 flex flex-wrap gap-2">
              <input
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  if (addState.kind !== "idle" && addState.kind !== "working") setAddState({ kind: "idle" });
                }}
                placeholder="BR-XXXXX"
                autoCapitalize="characters"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-lg bg-[var(--panel-soft)] px-3 py-2 font-mono text-sm uppercase tracking-widest text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={addState.kind === "working" || !codeInput.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {addState.kind === "working" ? t("friends.addFriend.sending") : t("friends.addFriend.sendRequest")}
              </button>
            </form>
            {addState.kind === "error" && (
              <p className="mt-2 text-xs text-[var(--danger)]">{addState.message}</p>
            )}
            {addState.kind === "sent" && (
              <p className="mt-2 text-xs text-[var(--accent)]">{t("friends.addFriend.requestSent", { name: addState.name })}</p>
            )}
            {addState.kind === "accepted" && (
              <p className="mt-2 text-xs text-[var(--accent)]">
                {t("friends.addFriend.alreadyRequestedYou", { name: addState.name })}
              </p>
            )}
          </section>

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("friends.requests.heading", { count: incoming.length })}
              </h2>
              <ul className="flex flex-col gap-2">
                {incoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3"
                  >
                    <Link
                      href={playerProfileHref(r.otherUserId)}
                      className="flex min-w-0 items-center gap-2 truncate text-sm font-medium text-[var(--heading)] hover:underline"
                    >
                      <PlayerAvatar avatar={avatars[r.otherUserId]} size={28} />
                      <span className="truncate">{nameOf(r.otherUserId, r.displayName)}</span>
                    </Link>
                    <span className="flex shrink-0 gap-2">
                      <button
                        onClick={() => respond(r.id, true)}
                        disabled={busyId === r.id}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        {t("multiplayer.accept")}
                      </button>
                      <button
                        onClick={() => respond(r.id, false)}
                        disabled={busyId === r.id}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                      >
                        {t("multiplayer.decline")}
                      </button>
                      <SafetyMenu
                        targetUserId={r.otherUserId}
                        targetName={nameOf(r.otherUserId, r.displayName)}
                        context="friends"
                        onBlocked={() => load()}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Friends list */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("friends.yourFriends.heading", { count: friends.length })}
            </h2>
            {friends.length === 0 ? (
              <EmptyState icon="🃏">{t("friends.yourFriends.empty")}</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {friends.map((f) => (
                  <li
                    key={f.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
                  >
                    <Link
                      href={playerProfileHref(f.userId)}
                      className="flex min-w-0 items-center gap-2 truncate text-sm font-medium text-[var(--heading)] hover:underline"
                    >
                      <PlayerAvatar avatar={avatars[f.userId]} size={28} />
                      <span className="truncate">{nameOf(f.userId, f.displayName)}</span>
                    </Link>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => cancelOrRemove(f.userId)}
                        disabled={busyId === f.userId}
                        className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        {t("common.remove")}
                      </button>
                      <SafetyMenu
                        targetUserId={f.userId}
                        targetName={nameOf(f.userId, f.displayName)}
                        context="friends"
                        onBlocked={() => load()}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Outgoing requests */}
          {outgoing.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                {t("friends.outgoing.heading")}
              </h2>
              <ul className="flex flex-col gap-2">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3 text-[var(--muted)]"
                  >
                    <Link
                      href={playerProfileHref(r.otherUserId)}
                      className="flex min-w-0 items-center gap-2 truncate text-sm hover:underline"
                    >
                      <PlayerAvatar avatar={avatars[r.otherUserId]} size={28} />
                      <span className="truncate">{nameOf(r.otherUserId, r.displayName)}</span>
                    </Link>
                    <button
                      onClick={() => cancelOrRemove(r.otherUserId)}
                      disabled={busyId === r.otherUserId}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--faint)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                    >
                      {t("common.cancel")}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </main>
  );
}

