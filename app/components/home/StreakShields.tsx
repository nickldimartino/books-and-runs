"use client";

// The streak-shield row on the Daily Deal / Weekly Challenge cards: one small
// shield glyph per slot (filled = held, outline = an open slot) plus a short,
// friendly explainer. Shields are earned by playing, never bought, and spent
// automatically — so this is purely informational, no button and no urgency.

import { useT } from "../../lib/i18n/LocaleProvider";

function ShieldGlyph({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" data-filled={filled ? "true" : "false"}>
      <path
        d="M10 2 3.5 4.6v4.7c0 4 2.6 7.1 6.5 8.7 3.9-1.6 6.5-4.7 6.5-8.7V4.6L10 2Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.4}
      />
    </svg>
  );
}

export function StreakShields({
  count,
  max,
  explainer,
  testId,
}: {
  count: number;
  max: number;
  /** Already-translated one-line explainer, also used as the tooltip. */
  explainer: string;
  testId: string;
}) {
  const { t } = useT();
  const held = Math.max(0, Math.min(max, count));
  const label = t("streakShield.label", { count: held, max });
  return (
    <div className="mt-1 flex items-start gap-1.5" data-testid={testId} title={`${label}. ${explainer}`}>
      <span role="img" aria-label={label} className="flex shrink-0 gap-0.5 pt-px text-[var(--accent)]">
        {Array.from({ length: max }, (_, i) => (
          <ShieldGlyph key={i} filled={i < held} />
        ))}
      </span>
      <p className="text-[10px] leading-snug text-[var(--faint)]">{explainer}</p>
    </div>
  );
}
