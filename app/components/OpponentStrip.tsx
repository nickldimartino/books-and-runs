"use client";

import { useEffect, useRef, useState } from "react";
import { DiscardEvent, Player } from "@/types";
import { PlayingCard } from "./PlayingCard";
import { personaBlurbFor } from "../lib/aiPersonas";

interface OpponentStripProps {
  players: Player[];
  currentPlayerIndex: number;
  discardHistory: DiscardEvent[];
  pickupHistory: DiscardEvent[];
  /** The last AI action, already attributed ("🦉 Hedda discarded the 4 of
   * diamonds") — shown verbatim while the next player decides, the way you'd
   * still see the last play on the table. Null on your turn. */
  aiStatus: string | null;
  aiThinking: boolean;
}

function latestCardFor(history: DiscardEvent[], playerId: string) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].playerId === playerId) return history[i].card;
  }
  return null;
}

/**
 * A sticky row under the header showing every seat — avatar, cards in
 * hand, whose turn it is — so the table state is glanceable without
 * scrolling, the way it would be at a real table. Fixed height, scrolls
 * horizontally for a full 8-player table, and auto-centres the active
 * seat. Tapping a seat opens its detail (latest discard/pickup, hand
 * count) — this is what replaced the collapsible Player activity table,
 * which grew the page instead of staying out of the way.
 */
export function OpponentStrip({
  players,
  currentPlayerIndex,
  discardHistory,
  pickupHistory,
  aiStatus,
  aiThinking,
}: OpponentStripProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [currentPlayerIndex]);

  // Dismiss the open player card on any tap outside the strip — matches the
  // expectation set by every other popover/menu on the platform. A chip tap
  // stays inside rootRef so this doesn't fight the toggle/switch handlers.
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [openId]);

  const current = players[currentPlayerIndex];
  const open = openId ? players.find((p) => p.id === openId) : null;

  // A meld/lay-off/discard note already carries its own player's name; fall
  // back to "<current> is thinking…" only while the up AI hasn't acted yet.
  const statusLine = aiStatus ?? (current?.isAI && aiThinking ? `${current.name} is thinking…` : null);

  return (
    <div
      ref={rootRef}
      data-tutorial="opponent-strip"
      className="sticky top-0 z-30 -mx-4 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-2 backdrop-blur"
    >
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {players.map((p, i) => {
          const active = i === currentPlayerIndex;
          const isOpen = openId === p.id;
          const avatar = p.isAI ? p.name.split(" ")[0] : p.name.trim().charAt(0).toUpperCase() || "•";
          const shortName = p.isAI ? p.name.replace(/^\S+\s+/, "") : p.name;
          return (
            <button
              key={p.id}
              ref={active ? activeRef : undefined}
              onClick={() => setOpenId(isOpen ? null : p.id)}
              aria-label={`${p.name}, ${p.hand.length} cards in hand${active ? ", their turn" : ""}`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]/12 text-[var(--heading)]"
                  : isOpen
                    ? "border-[var(--accent)]/50 bg-[var(--panel)] text-[var(--muted)]"
                    : "border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
              }`}
            >
              <span
                aria-hidden="true"
                className={
                  p.isAI
                    ? "text-sm leading-none"
                    : "grid h-4 w-4 place-items-center rounded-full bg-[var(--panel-soft)] text-[10px] font-bold leading-none text-[var(--muted)]"
                }
              >
                {avatar}
              </span>
              {active && <span className="max-w-[7.5rem] truncate font-medium">{shortName}</span>}
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold leading-[1.35] ${
                  active
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "bg-[var(--panel-soft)] text-[var(--muted)]"
                }`}
              >
                {p.hand.length}
              </span>
            </button>
          );
        })}
      </div>

      {statusLine && (
        <p className="mt-1 truncate text-[11px] text-[var(--faint)]" role="status">
          {statusLine}
        </p>
      )}

      {open && (
        // Same three-column shape as the game header: identity on the left
        // (name, hand count, persona blurb), then last discard, then last
        // pickup — nothing the old Player activity row carried is dropped,
        // it's just laid out to read at a glance the way the header does.
        <div className="relative mt-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-xs">
          <button
            onClick={() => setOpenId(null)}
            aria-label="Close"
            className="absolute right-1.5 top-1.5 rounded p-1 text-sm leading-none text-[var(--faint)] hover:text-[var(--muted)]"
          >
            ✕
          </button>
          <div className="flex items-start justify-between gap-3 pr-5">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-semibold text-[var(--heading)]">{open.name}</span>
                <span className="text-[var(--faint)]">{open.hand.length} in hand</span>
              </p>
              {open.isAI && personaBlurbFor(open.name) && (
                <p className="mt-1 text-[var(--faint)]">{personaBlurbFor(open.name)}</p>
              )}
            </div>
            <ActivityCard label="Last discard" card={latestCardFor(discardHistory, open.id)} />
            <ActivityCard label="Last pickup" card={latestCardFor(pickupHistory, open.id)} />
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityCard({ label, card }: { label: string; card: DiscardEvent["card"] | null }) {
  return (
    <div className="shrink-0 text-center">
      <p className="whitespace-nowrap text-[10px] uppercase tracking-wide text-[var(--faint)]">{label}</p>
      <div className="mt-1 flex justify-center">
        {card ? (
          <PlayingCard card={card} small />
        ) : (
          <span className="flex h-14 w-10 items-center justify-center text-sm text-[var(--faint)]">—</span>
        )}
      </div>
    </div>
  );
}
