"use client";

// Friends page. The friend list, incoming/outgoing requests (accept/deny),
// this account's own friend code + a Share action, and handling of an
// incoming share link (`/friends?add=BR-XXXXX` → resolve the code → one tap
// creates an already-accepted friendship both ways via addFriendByCode).
// Signed-out visitors on a share link are routed through /sign-in?next=…
// and land back here.

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { LoadingSpinner } from "../components/LoadingSpinner";
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
import { displayNameFor } from "../lib/leaderboardStore";
import { supabase } from "../lib/supabaseClient";

function nameOf(userId: string, displayName: string | null): string {
  return displayNameFor({ user_id: userId, display_name: displayName });
}

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

  const [code, setCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
    } catch (err) {
      console.error("Failed to load friends:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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
        setAddState({ kind: "error", message: "No account has that code." });
        return;
      }
      if (match.userId === user?.id) {
        setAddState({ kind: "error", message: "That's your own code." });
        return;
      }
      const alreadyFriend = friends.some((f) => f.userId === match.userId);
      if (alreadyFriend) {
        setAddState({ kind: "error", message: `You're already friends with ${nameOf(match.userId, match.displayName)}.` });
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
      setAddState({ kind: "error", message: "Couldn't send that request — try again." });
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

  async function shareCode() {
    if (!code) return;
    const url = `${window.location.origin}/friends?add=${code}`;
    const text = `Add me as a friend on Books & Runs 🃏  My code: ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Books & Runs", text, url });
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2000);
      } catch {
        /* user cancelled the sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  if (!authLoading && !configured) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Friends aren&apos;t set up yet</h1>
        <p className="text-sm text-[var(--muted)]">This app doesn&apos;t have a Supabase project connected yet.</p>
        <Link
          href="/"
          className="mt-2 rounded-lg border border-[var(--border)] px-6 py-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          Back to Home
        </Link>
      </Shell>
    );
  }

  if (!authLoading && configured && !user) {
    const signInHref = linkCode
      ? `/sign-in?next=${encodeURIComponent(`/friends?add=${linkCode}`)}`
      : "/sign-in";
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-[var(--heading)]">
          {linkCode ? "Sign in to add this friend" : "Sign in to add friends"}
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {linkCode
            ? "Someone shared a friend link with you. Sign in and you'll come right back here to accept it."
            : "Friends let you start multiplayer games together. Your friend list is tied to your account."}
        </p>
        <Link
          href={signInHref}
          className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
        >
          Sign in
        </Link>
      </Shell>
    );
  }

  const incoming = requests.filter((r) => r.direction === "incoming");
  const outgoing = requests.filter((r) => r.direction === "outgoing");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Friends</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Add friends to start multiplayer games with them. Share your code, or paste theirs.
        </p>
      </div>

      {authLoading || loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <p className="text-sm text-[var(--danger)]">
          Couldn&apos;t load your friends — check your connection, or that this Supabase project has
          every migration in <code>supabase/migrations/</code> applied.
        </p>
      ) : (
        <>
          {/* Shared friend link (?add=CODE) */}
          {linkInvite.kind === "prompt" && (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4">
              <p className="text-sm text-[var(--heading)]">
                Add <strong className="font-semibold">{linkInvite.name}</strong> as a friend?
              </p>
              <button
                onClick={acceptLink}
                className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
              >
                Add friend
              </button>
            </section>
          )}
          {linkInvite.kind === "adding" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              Adding…
            </section>
          )}
          {linkInvite.kind === "done" && (
            <section className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-4 text-sm text-[var(--accent)]">
              You and <strong className="font-semibold">{linkInvite.name}</strong> are now friends.
            </section>
          )}
          {linkInvite.kind === "already" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              You&apos;re already friends with <strong className="font-semibold">{linkInvite.name}</strong>.
            </section>
          )}
          {linkInvite.kind === "self" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
              That link has your own code — share it with a friend instead.
            </section>
          )}
          {linkInvite.kind === "invalid" && (
            <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--danger)]">
              That friend link didn&apos;t work — the code may be wrong.
            </section>
          )}

          {/* Your code */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Your friend code</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="select-all font-mono text-2xl font-bold tracking-widest text-[var(--heading)]">
                {code}
              </span>
              <button
                onClick={shareCode}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
              >
                {shareState === "shared" || shareState === "copied"
                  ? "Shared ✓"
                  : shareState === "error"
                    ? "Couldn't share"
                    : "Share"}
              </button>
              <button
                onClick={copyCode}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
              >
                {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          </section>

          {/* Add a friend */}
          <section className="rounded-xl border border-[var(--border)] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">Add a friend</h2>
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
                {addState.kind === "working" ? "Sending…" : "Send request"}
              </button>
            </form>
            {addState.kind === "error" && (
              <p className="mt-2 text-xs text-[var(--danger)]">{addState.message}</p>
            )}
            {addState.kind === "sent" && (
              <p className="mt-2 text-xs text-[var(--accent)]">Request sent to {addState.name}.</p>
            )}
            {addState.kind === "accepted" && (
              <p className="mt-2 text-xs text-[var(--accent)]">
                {addState.name} had already requested you — you&apos;re now friends.
              </p>
            )}
          </section>

          {/* Incoming requests */}
          {incoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Requests ({incoming.length})
              </h2>
              <ul className="flex flex-col gap-2">
                {incoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--heading)]">
                      {nameOf(r.otherUserId, r.displayName)}
                    </span>
                    <span className="flex shrink-0 gap-2">
                      <button
                        onClick={() => respond(r.id, true)}
                        disabled={busyId === r.id}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => respond(r.id, false)}
                        disabled={busyId === r.id}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Friends list */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              Your friends ({friends.length})
            </h2>
            {friends.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-[var(--border)] px-4 py-5">
                <span className="text-2xl" aria-hidden="true">🃏</span>
                <p className="text-sm text-[var(--faint)]">
                  No friends yet. Send someone your code above to get started.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {friends.map((f) => (
                  <li
                    key={f.userId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--heading)]">
                      {nameOf(f.userId, f.displayName)}
                    </span>
                    <button
                      onClick={() => cancelOrRemove(f.userId)}
                      disabled={busyId === f.userId}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--danger)] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Outgoing requests */}
          {outgoing.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
                Sent, awaiting a reply
              </h2>
              <ul className="flex flex-col gap-2">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3 text-[var(--muted)]"
                  >
                    <span className="min-w-0 truncate text-sm">{nameOf(r.otherUserId, r.displayName)}</span>
                    <button
                      onClick={() => cancelOrRemove(r.otherUserId)}
                      disabled={busyId === r.otherUserId}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-[var(--faint)] hover:bg-[var(--panel-soft)] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Link href="/" className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {children}
    </main>
  );
}
