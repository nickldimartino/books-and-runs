import type { Vars } from "./i18n/LocaleProvider";

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
