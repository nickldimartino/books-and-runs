import type { Vars } from "./i18n/LocaleProvider";
import { RUN_ORDER, validateManualGroup } from "@/meld";
import type { Card, ContractRequirement } from "@/types";

type TPlural = (key: string, count: number, vars?: Vars) => string;

// Shared between solo/pass-and-play and multiplayer's hand-drawer meld
// builder — both render the same "this round needs X" heading. Takes
// tPlural rather than calling useT() itself since this is a plain
// function (not a component/hook), shared by two different components.
export function contractNeedLabel(books: number, runs: number, tPlural: TPlural): string {
  const parts: string[] = [];
  if (books > 0) parts.push(tPlural("contract.book", books));
  if (runs > 0) parts.push(tPlural("contract.run", runs));
  return parts.join(" + ");
}

/** For one candidate run window, which rank(s) a wild in this selection
 * would stand in for — e.g. "2" or "6" for the two ways naturals 3-4-5 plus
 * one wild could resolve. Uses wildCardIds rather than comparing a card's
 * own rank to its slot's rank — a 2 standing in for a *different* suit's
 * "2" slot has a rank that happens to match its slot anyway, which a naive
 * comparison would misread as "natural, not a stand-in." */
export function wildStandInLabel(cards: Card[], contract: ContractRequirement, start: number, jokerAbbr: string): string {
  const result = validateManualGroup(cards, contract, start);
  if (!result.orderedCards || !result.wildCardIds) return String(start);
  const ranks: string[] = [];
  result.orderedCards.forEach((c, i) => {
    if (result.wildCardIds!.has(c.id)) {
      const expected = RUN_ORDER[start + i];
      ranks.push(expected === "JOKER" ? jokerAbbr : expected);
    }
  });
  return ranks.join(", ");
}

