"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { CardFaceId, loadLocalCardFace, saveLocalCardFace } from "../../lib/cardFaceStore";
import { CardFacePicker } from "../CardFacePicker";

/**
 * Its own page rather than a section on the main Settings screen — same
 * reasoning as Theme and Card back (see SwatchPicker's own doc): a real
 * tile-per-option grid reads far better full-width than squeezed into the
 * middle of a page most visits are there to flip a toggle on.
 */
export default function CardFaceSettingsPage() {
  const [cardFace, setCardFace] = useState<CardFaceId>("classic");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setCardFace(loadLocalCardFace());
    setLoading(false);
  }, []);

  function handleChange(id: CardFaceId) {
    setCardFace(id);
    saveLocalCardFace(id);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <Link
        href="/settings"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Settings
      </Link>
      <div className="-mt-2">
        <h1 className="text-2xl font-bold text-[var(--heading)]">Card face</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          How a card&apos;s rank and suit are drawn. Separate from Theme and Card back, so any table
          look can be paired with any card face.
        </p>
      </div>

      {loading ? <LoadingSpinner /> : <CardFacePicker active={cardFace} onSelect={handleChange} />}
    </main>
  );
}
