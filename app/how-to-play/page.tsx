import Link from "next/link";
import { CONTRACTS } from "@/types";
import { BackNav } from "./BackNav";

export const metadata = {
  title: "How to Play — Books & Runs",
};

const PENALTY_ROWS = [
  { label: "Number cards (3–10)", value: "5 points each" },
  { label: "Face cards (J, Q, K)", value: "10 points each" },
  { label: "Aces", value: "15 points each" },
  { label: "Twos (wild)", value: "20 points each" },
  { label: "Jokers (wild)", value: "50 points each" },
];

export default function HowToPlayPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <BackNav />
      <h1 className="text-2xl font-bold text-amber-100">How to Play</h1>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-emerald-100/80">
        <h2 className="text-base font-semibold text-amber-100">Basic setup</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Best with 3–8 people.</li>
          <li>One standard 52-card deck per 2 players, plus jokers, all shuffled together.</li>
          <li>Each player is dealt 13 cards.</li>
          <li>The rest of the deck forms the draw pile; the top card starts the discard pile.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-amber-100">The contracts (play in order)</h2>
        <p className="text-sm text-emerald-100/70">
          Each round has its own required contract. You must complete the full contract for that
          round — all at once — before you can lay off cards on any meld.
        </p>
        <div className="overflow-hidden rounded-xl border border-emerald-100/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-emerald-900/60 text-emerald-100/60">
              <tr>
                <th className="px-3 py-2 font-medium">Round</th>
                <th className="px-3 py-2 font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Melds needed</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.round} className="border-t border-emerald-100/10">
                  <td className="px-3 py-2">{c.round}</td>
                  <td className="px-3 py-2 font-semibold text-amber-100">{c.label}</td>
                  <td className="px-3 py-2 text-emerald-100/70">
                    {c.books > 0 && `${c.books} book${c.books > 1 ? "s" : ""}`}
                    {c.books > 0 && c.runs > 0 && " + "}
                    {c.runs > 0 && `${c.runs} run${c.runs > 1 ? "s" : ""}`}
                    {c.noDiscardOnGoOut && " (no discard on going out)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-emerald-100/50">
          A book is 3+ matching-rank cards; a run is 4+ same-suit cards in sequence.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-emerald-100/80">
        <h2 className="text-base font-semibold text-amber-100">How a turn works</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-amber-100">Draw</strong> — take one card from the draw pile or
            the top of the discard pile.
          </li>
          <li>
            <strong className="text-amber-100">Meld</strong> — you may only lay down cards once you
            can place your entire round&apos;s contract at once. No partial melds.
          </li>
          <li>
            <strong className="text-amber-100">Lay off</strong> — once you&apos;ve melded your
            contract, you may add extra cards to your own or any other player&apos;s already-laid
            melds.
          </li>
          <li>
            <strong className="text-amber-100">Discard</strong> — end your turn by discarding one
            card, except in Round 7 (see below).
          </li>
          <li>
            <strong className="text-amber-100">Going out</strong> — the round ends the moment a
            player melds their full contract and has no cards left. Everyone else scores penalty
            points for the cards remaining in hand.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-emerald-100/80">
        <h2 className="text-base font-semibold text-amber-100">Round 7 special rule — no discard</h2>
        <p>
          In Round 7 (3 Runs), a player who can lay down all three runs at once goes out
          immediately upon melding — there&apos;s no final discard required. The round ends the
          instant the last card is melded.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-amber-100">Scoring</h2>
        <p className="text-sm text-emerald-100/70">
          When a round ends, every player who did not go out scores penalty points for the cards
          left in their hand. Lowest total score after all 7 rounds wins the game.
        </p>
        <div className="overflow-hidden rounded-xl border border-emerald-100/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-emerald-900/60 text-emerald-100/60">
              <tr>
                <th className="px-3 py-2 font-medium">Card</th>
                <th className="px-3 py-2 font-medium">Penalty points</th>
              </tr>
            </thead>
            <tbody>
              {PENALTY_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-emerald-100/10">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-amber-100">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-emerald-100/80">
        <h2 className="text-base font-semibold text-amber-100">Wild cards</h2>
        <p>Jokers and 2s are wild and may substitute for any card in a book or run.</p>
      </section>

      <Link href="/" className="text-sm text-emerald-100/60 hover:text-emerald-100">
        Back to Home
      </Link>
    </main>
  );
}
