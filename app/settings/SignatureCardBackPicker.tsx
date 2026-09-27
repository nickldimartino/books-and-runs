"use client";

import { CSSProperties } from "react";
import Link from "next/link";
import { useT } from "../lib/i18n/LocaleProvider";
import { isCardCosmeticUnlocked } from "../lib/cardCosmeticUnlocks";
import { SIGNATURE_CARD_BACKS, SignatureCardBackId, SignatureCardBackOption } from "../lib/cardBackStore";
import { LOCKED_ITEM_CLASS, lockedCaption } from "../lib/cosmeticLockStyle";
import { itemSkuFor } from "../lib/storeSku";
import { cardBackDescKey, cardUnlockText } from "./pickerText";
import { CheckBadge } from "./SwatchPicker";

// A small standalone grid for the 2 "Signature" card backs (not derived
// from any theme — see cardBackStore.ts's own doc) — deliberately kept
// separate from SwatchPicker rather than folded into its theme-driven
// grid, since SwatchPicker's props are typed to ThemeId specifically and
// /settings/theme reuses that exact same component; widening it to accept
// an arbitrary id risks Theme's own picker somehow surfacing these.
function SignatureCardBackTile({
  option,
  isActive,
  unlocked,
  onClick,
}: {
  option: SignatureCardBackOption;
  isActive: boolean;
  unlocked: boolean;
  onClick: () => void;
}) {
  const { t, tPlural } = useT();
  const boutiqueLocked = !unlocked && option.source === "boutique";
  const title = unlocked || !option.unlock
    ? t(cardBackDescKey(option.id))
    : boutiqueLocked
      ? `${cardUnlockText(t, tPlural, option.unlock)} — ${t("boutique.getInBoutique")}`
      : cardUnlockText(t, tPlural, option.unlock);
  const className = `relative flex flex-col overflow-hidden rounded-xl text-left ring-2 transition ${
    !unlocked ? LOCKED_ITEM_CLASS : isActive ? "ring-[var(--accent)]" : "ring-transparent hover:ring-[var(--border)]"
  }`;
  const content = (
    <>
      <span
        data-cardback={option.id}
        className="card-back flex h-11 items-center justify-center"
        style={{ background: "var(--panel-soft)" } as CSSProperties}
        aria-hidden="true"
      />
      <span className="bg-[var(--panel)] px-2 py-1.5">
        <span className="block truncate text-xs font-medium text-[var(--heading)]">
          {lockedCaption(option.name, unlocked)}
        </span>
      </span>
      {isActive && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow">
          <CheckBadge className="h-2.5 w-2.5" />
        </span>
      )}
    </>
  );
  // A locked Boutique style is a real thing to go buy, not a dead end —
  // tapping it deep-links into the store instead of doing nothing.
  return boutiqueLocked ? (
    <Link href={`/boutique?item=${itemSkuFor("card_back", option.id)}`} title={title} className={className}>
      {content}
    </Link>
  ) : (
    <button onClick={unlocked ? onClick : undefined} aria-current={isActive} title={title} className={className}>
      {content}
    </button>
  );
}

export function SignatureCardBackPicker({
  active,
  onSelect,
  level,
  isCreator = false,
  ownedSkus,
}: {
  active: SignatureCardBackId | null;
  onSelect: (id: SignatureCardBackId) => void;
  /** See CardFacePicker's own doc on this same prop. */
  level: number;
  /** Gates the Boutique style (Static) — same source as `level`. */
  isCreator?: boolean;
  /** See CardFacePicker's own doc on this same prop. */
  ownedSkus?: ReadonlySet<string>;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">{t("settingsPicker.signature")}</p>
      <div className="grid grid-cols-2 gap-2">
        {SIGNATURE_CARD_BACKS.map((s) => (
          <SignatureCardBackTile
            key={s.id}
            option={s}
            isActive={active === s.id}
            unlocked={isCardCosmeticUnlocked(s.unlock, level, isCreator, ownedSkus)}
            onClick={() => onSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
