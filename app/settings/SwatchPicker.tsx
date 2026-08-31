"use client";

import { CSSProperties, useState } from "react";
import { THEMES, ThemeCategory, ThemeId, ThemeOption } from "../lib/themeStore";
import { THEME_SWATCHES } from "./themeSwatches";

function CheckBadge({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 111.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// A skin-picker tile — a color block up top (the actual preview, since a
// theme's page background is the one thing every other choice below it
// tints), a name label on its own strip in that theme's own panel/heading
// colors, and a corner checkmark badge when selected. Reads at a glance the
// way a cosmetic grid in most modern games already does, and a genuine
// color block (not a small dot) is a far more honest preview of what a
// theme actually looks like once applied.
function SwatchTile({ option, isActive, onClick }: { option: ThemeOption; isActive: boolean; onClick: () => void }) {
  const swatch = THEME_SWATCHES[option.id];
  return (
    <button
      onClick={onClick}
      aria-current={isActive}
      title={option.description}
      className={`relative flex flex-col overflow-hidden rounded-xl text-left ring-2 transition ${
        isActive ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--border)]"
      }`}
    >
      <span className="flex h-11 items-end justify-end p-1.5" style={{ background: swatch.bg }} aria-hidden="true">
        <span className="h-3.5 w-3.5 rounded-full shadow" style={{ background: swatch.accent }} />
      </span>
      <span className="px-2 py-1.5" style={{ background: swatch.panel }}>
        <span className="block truncate text-xs font-medium" style={{ color: swatch.heading }}>
          {option.name}
        </span>
      </span>
      {isActive && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
          <CheckBadge className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

// The Card back picker's own tile — a card back's identity is its motif
// (diamonds, lightning bolts, peppermint stripes…) *and* the background it
// sits on (several of the dark themes' card backs are themselves dark), not
// a table felt color, so this shows the real thing rather than SwatchTile's
// flat color block. The `.card-back` class goes directly on the swatch
// area itself — full tile width, not a small floating icon — with
// `data-cardback` scoping globals.css's [data-cardback="X"] custom
// properties locally to just this element and its children (the same
// mechanism the real draw pile uses, just applied to a detached preview
// instead of the live game), and an inline --accent override so even its
// box-shadow glow matches this option's own frozen color instead of
// whatever theme happens to be active on <html> right now. The background
// itself is that option's own literal bg (from THEME_SWATCHES, the same
// source SwatchTile's felt-color preview already uses) rather than the
// live --elevated var, which is what actually makes a dark card back read
// as dark here regardless of the currently active table theme.
function CardBackTile({ option, isActive, onClick }: { option: ThemeOption; isActive: boolean; onClick: () => void }) {
  const swatch = THEME_SWATCHES[option.id];
  return (
    <button
      onClick={onClick}
      aria-current={isActive}
      title={option.description}
      className={`relative flex flex-col overflow-hidden rounded-xl text-left ring-2 transition ${
        isActive ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--border)]"
      }`}
    >
      <span
        data-cardback={option.id}
        className="card-back flex h-11 items-center justify-center"
        style={{ background: swatch.bg, "--accent": swatch.accent } as CSSProperties}
        aria-hidden="true"
      />
      <span className="px-2 py-1.5" style={{ background: swatch.panel }}>
        <span className="block truncate text-xs font-medium" style={{ color: swatch.heading }}>
          {option.name}
        </span>
      </span>
      {isActive && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
          <CheckBadge className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

// The Card back picker's one non-color option — sized and styled to sit
// naturally above the same tile grid rather than looking like a stray extra
// row, since "always match whatever theme is active" isn't a preview-able
// color the way every other card back option is.
function MatchThemeTile({ isActive, onClick }: { isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-2 transition ${
        isActive ? "bg-[var(--accent)]/10 ring-[var(--accent)]" : "bg-[var(--panel)] ring-transparent hover:ring-[var(--border)]"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--panel-soft)]" aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-[var(--accent)]" fill="none">
          <rect x="2.5" y="7" width="9" height="6" rx="3" stroke="currentColor" strokeWidth="1.4" />
          <rect x="8.5" y="7" width="9" height="6" rx="3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--heading)]">Match table theme</span>
        <span className="block text-xs text-[var(--faint)]">Always follows whichever theme is active above.</span>
      </span>
      {isActive && <CheckBadge className="h-4 w-4 shrink-0 text-[var(--accent)]" />}
    </button>
  );
}

const CATEGORIES: ThemeCategory[] = ["classic", "holiday"];

// A segmented Classic/Holiday switch instead of two independently
// expand/collapse sections — only one category's grid is ever on screen at
// once, which is what actually keeps ~38 options from turning into a long
// scroll: a "Show ▼" disclosure still leaves the *other* category's rows
// sitting there once opened, where a tab just replaces the grid outright.
function CategoryTabs({ tab, onChange }: { tab: ThemeCategory; onChange: (t: ThemeCategory) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--panel-soft)] p-1" role="tablist">
      {CATEGORIES.map((c) => (
        <button
          key={c}
          role="tab"
          aria-selected={tab === c}
          onClick={() => onChange(c)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
            tab === c
              ? "bg-[var(--accent)] text-[var(--on-accent)]"
              : "text-[var(--muted)] hover:bg-[var(--panel)]"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/**
 * Shared by /settings/theme and /settings/card-back — both are "pick one of
 * the same 38 looks" pickers, just applied to a different part of the game.
 * Each one gets its own dedicated page rather than living inline on the
 * main Settings page: at a genuine color-block-per-tile size, both grids
 * together used to be ~60% of Settings' entire scroll length, ahead of
 * every toggle most visits are actually there to flip. Settings itself now
 * only shows a compact "current selection" row linking to whichever of
 * these two pages.
 *
 * Opens on whichever tab the current selection belongs to (so the first
 * thing you see is never a grid with nothing highlighted in it), and keeps
 * a compact "Currently: X" line visible above the tabs regardless of which
 * one you're browsing.
 */
export function SwatchPicker({
  active,
  onSelect,
  matchOption,
}: {
  active: ThemeId | "match";
  onSelect: (id: ThemeId | "match") => void;
  matchOption?: boolean;
}) {
  const activeOption = active === "match" ? undefined : THEMES.find((t) => t.id === active);
  const [tab, setTab] = useState<ThemeCategory>(activeOption?.category ?? "classic");
  const visible = THEMES.filter((t) => t.category === tab);
  const currentSwatch = activeOption ? THEME_SWATCHES[activeOption.id] : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2 text-xs text-[var(--faint)]">
        {currentSwatch && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: currentSwatch.accent }}
            aria-hidden="true"
          />
        )}
        Currently:{" "}
        <span className="font-semibold text-[var(--muted)]">
          {activeOption ? activeOption.name : "Match table theme"}
        </span>
      </p>

      {matchOption && <MatchThemeTile isActive={active === "match"} onClick={() => onSelect("match")} />}

      <CategoryTabs tab={tab} onChange={setTab} />

      {/* matchOption doubles as "this is the Card back picker, not Theme" —
          the only two SwatchPicker callers happen to line up exactly that
          way (Theme never shows a Match tile; Card back always does), so a
          separate flag just for tile choice would be tracking the same
          thing twice. */}
      <div className="grid grid-cols-2 gap-2">
        {visible.map((t) =>
          matchOption ? (
            <CardBackTile key={t.id} option={t} isActive={active === t.id} onClick={() => onSelect(t.id)} />
          ) : (
            <SwatchTile key={t.id} option={t} isActive={active === t.id} onClick={() => onSelect(t.id)} />
          )
        )}
      </div>
    </div>
  );
}
