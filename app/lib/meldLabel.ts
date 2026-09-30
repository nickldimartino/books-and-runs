import type { Meld } from "@/types";
import { cardLabel } from "../components/PlayingCard";
import type { TranslationKey } from "./i18n/keys";

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * "Book: 6 of clubs, 6 of hearts, 6 of diamonds" — the accessible name for a
 * table meld button (game/page.tsx, multiplayer/play/page.tsx). Sighted
 * players see the actual cards laid out; without this, a screen-reader user
 * choosing where to lay off a selected card heard only "Book" or "Run" (or,
 * in multiplayer, nothing at all — the button had no label whatsoever), with
 * no way to tell one book/run apart from another of the same type.
 * `Intl.ListFormat` (not a hardcoded ", "/"and") for a properly localized
 * card list — the same tool app/history/HistoryContent.tsx already uses for
 * its credits line.
 */
export function meldLabel(meld: Meld, t: T, locale: string): string {
  const type = meld.type === "book" ? t("game.meld.book") : t("game.meld.run");
  const cards = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    meld.cards.map((c) => cardLabel(c, t))
  );
  return t("game.meldLabelFull", { type, cards });
}
