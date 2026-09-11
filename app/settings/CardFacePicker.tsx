"use client";

import { Card } from "@/types";
import { CardFace } from "../components/CardFace";
import { CARD_FACES, CardFaceId, CardFaceOption } from "../lib/cardFaceStore";
import { CheckBadge } from "./SwatchPicker";

// A fixed sample card every tile previews — a numbered, red card (rather
// than a court or the joker) since a numbered rank is the everyday case
// this whole feature is about making legible.
const PREVIEW_CARD: Card = { id: "preview", suit: "hearts", rank: "7", isWild: false };

// Same tile footprint as SwatchPicker's SwatchTile/CardBackTile (h-11
// preview strip + a label strip, same rounded-xl + ring treatment) — but
// unlike those, the preview isn't a color block filling the strip edge to
// edge: it's a small rendered card, sized like a real mini card, sitting on
// a neutral background, since what's actually being previewed here is a
// drawing, not a flat color.
function CardFaceTile({
  option,
  isActive,
  onClick,
}: {
  option: CardFaceOption;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive}
      title={option.description}
      className={`relative flex flex-col overflow-hidden rounded-xl text-left ring-2 transition ${
        isActive ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--border)]"
      }`}
    >
      <span className="flex h-11 items-center justify-center bg-[var(--panel-soft)]" aria-hidden="true">
        <span className="card-face h-9 w-7 overflow-hidden rounded-md shadow-sm">
          <CardFace card={PREVIEW_CARD} style={option.id} />
        </span>
      </span>
      <span className="bg-[var(--panel)] px-2 py-1.5">
        <span className="block truncate text-xs font-medium text-[var(--heading)]">{option.name}</span>
      </span>
      {isActive && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
          <CheckBadge className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );
}

export function CardFacePicker({ active, onSelect }: { active: CardFaceId; onSelect: (id: CardFaceId) => void }) {
  const activeOption = CARD_FACES.find((f) => f.id === active);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-[var(--faint)]">
        Currently: <span className="font-semibold text-[var(--muted)]">{activeOption?.name ?? "Classic"}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CARD_FACES.map((f) => (
          <CardFaceTile key={f.id} option={f} isActive={active === f.id} onClick={() => onSelect(f.id)} />
        ))}
      </div>
    </div>
  );
}
