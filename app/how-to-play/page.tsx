import Link from "next/link";
import type { ReactNode } from "react";
import { CONTRACTS } from "@/types";
import { BackNav } from "./BackNav";

export const metadata = {
  title: "How to Play — Books & Runs",
};

const PENALTY_ROWS = [
  { label: "Number cards (3 through 9)", value: "5 points each" },
  { label: "10, J, Q, K", value: "10 points each" },
  { label: "Aces", value: "15 points each" },
  { label: "Twos (wild)", value: "20 points each" },
  { label: "Jokers (wild)", value: "50 points each" },
];

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs text-[var(--heading)]">
      <strong className="font-semibold">Note:</strong> {children}
    </p>
  );
}

export default function HowToPlayPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <BackNav />
      <h1 className="text-2xl font-bold text-[var(--heading)]">How to Play</h1>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">Basic setup</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            2–8 players (pass-and-play on one device, plus any number of AI opponents) — set them
            up, name the human players, and pick each AI&apos;s difficulty on the New Game screen.
          </li>
          <li>One standard 52-card deck per 2 players, plus jokers, all shuffled together.</li>
          <li>Each player is dealt 13 cards.</li>
          <li>The rest of the deck forms the draw pile; the top card starts the discard pile.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--heading)]">Rounds you&apos;ll play</h2>
        <p className="text-sm text-[var(--muted)]">
          Each round has its own required contract. You must complete the full contract for that
          round — all at once — before you can lay off cards on any meld. The standard game is all
          7 rounds below, played in order.
        </p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel)] text-[var(--faint)]">
              <tr>
                <th className="px-3 py-2 font-medium">Round</th>
                <th className="px-3 py-2 font-medium">Contract</th>
                <th className="px-3 py-2 font-medium">Melds needed</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.round} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{c.round}</td>
                  <td className="px-3 py-2 font-semibold text-[var(--heading)]">{c.label}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {c.books > 0 && `${c.books} book${c.books > 1 ? "s" : ""}`}
                    {c.books > 0 && c.runs > 0 && " + "}
                    {c.runs > 0 && `${c.runs} run${c.runs > 1 ? "s" : ""}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--faint)]">
          A book is 3+ matching-rank cards; a run is 4+ same-suit cards in sequence.
        </p>
        <Note>
          On the New Game screen, you can change which rounds are played. <strong>Short</strong>{" "}
          drops rounds 4 and 5 (the two hardest, mixed contracts) and plays the rest in order.{" "}
          <strong>Custom</strong> lets you pick any subset of the 7 rounds above — they always play
          in their original 1–7 order, whichever ones you&apos;ve picked. Anywhere this page says
          &quot;Round 7&quot; or &quot;after all 7 rounds,&quot; read that as this game&apos;s actual
          last round if you&apos;re playing Short or Custom.
        </Note>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">How a turn works</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">Draw</strong> — take one card from the draw pile or
            the top of the discard pile.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Meld</strong> — you may only lay down cards once you
            can place your entire round&apos;s contract at once. No partial melds. You choose which
            of your own cards go into each book or run — see below.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Lay off</strong> — once you&apos;ve melded your
            contract, you may add extra cards to your own or any other player&apos;s already-laid
            melds. A run stays in sorted order as cards are added, and a wild always shows a small
            &quot;as X&quot; badge for the rank it&apos;s standing in for. If a wild could extend
            either end of a run, you&apos;ll be asked which rank you mean it to be. A small ↓ badge
            marks any hand card or discard-pile card that fits some meld already on the table —
            shown even before you&apos;ve melded your own contract, so you can plan which cards to
            hold onto. Turn this off in Settings if you&apos;d rather work it out yourself.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Discard</strong> — end your turn by discarding one
            card. If melding and/or laying off used every card in your hand, there&apos;s nothing left
            to discard — see &quot;Going out&quot; below.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Going out</strong> — the round ends the moment a
            player who has melded their full contract has no cards left in hand, whether that happens
            right at melding, after laying more cards off, or after a later discard. No discard is
            needed once your hand is already empty. Everyone else scores penalty points for the cards
            remaining in hand.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">Choosing your meld cards</h2>
        <p>
          When you&apos;re ready to meld, you build it yourself instead of the game picking for
          you:
        </p>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Tap cards in your hand to select the ones for one book or run.</li>
          <li>
            Tap <strong className="text-[var(--heading)]">Group selected cards</strong> — if they form a
            valid book or run, they&apos;re staged and removed from your visible hand.
          </li>
          <li>Repeat for each book/run the round&apos;s contract needs.</li>
          <li>
            Once your staged groups exactly match the contract, tap{" "}
            <strong className="text-[var(--heading)]">Confirm Meld</strong> to lay them all down at once.
          </li>
        </ol>
        <p>
          You can remove a staged group before confirming if you change your mind. If a selection
          isn&apos;t a valid book or run, you&apos;ll see why (see the rules below).
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">Books and runs — the rules</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">Book:</strong> 3 or more cards of the same rank,
            different suits.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Run:</strong> 4 or more cards of the same suit in
            consecutive rank order.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Ace can be low or high</strong> — a run can go A-2-3-4
            or J-Q-K-A, but never both at once. A run can&apos;t wrap around, like Q-K-A-2 — Ace can
            anchor one end of a run, not bridge King and 2 in the same one.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Wild cards:</strong> Jokers and 2s are wild and can
            fill in for any missing card in a book or run.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Wild-card limit:</strong> a meld can never use more
            wild cards than natural (non-wild) cards. A 3-card book can have at most 1 wild; a
            4-card run can have at most 2.
          </li>
          <li>
            <strong className="text-[var(--heading)]">No two wilds in a row:</strong> in a run, wild cards
            can&apos;t fill two consecutive slots — e.g. 6-7-<em>wild</em>-<em>wild</em> isn&apos;t
            allowed, but 6-7-8-<em>wild</em> or <em>wild</em>-6-7-<em>wild</em> is fine.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">
          Going out without a discard
        </h2>
        <p>
          If melding your contract and/or laying cards off already used your entire hand, you go
          out immediately — there&apos;s nothing left to discard, so none is required. This can
          happen in <strong className="text-[var(--heading)]">any round</strong>, not just the last
          one.
        </p>
        <p>
          Outside of the last round, melding the contract by itself doesn&apos;t end the round if
          cards remain in hand afterward — you still discard normally, same as any other turn. The
          round only ends once your hand actually reaches zero, whether that happens right at
          melding, after laying more cards off, or from a discard.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">
          3 Runs: no discard at all
        </h2>
        <p>
          The <strong className="text-[var(--heading)]">3 Runs</strong> contract — round 7 in the
          standard sequence, and always the last round whenever it&apos;s included — works
          differently from every other round: your entire hand has to go into the meld, all at
          once. There&apos;s no discard step for it, and no laying off extra cards afterward either.
          If a run needs to be longer than the usual minimum of 4 to fit everything, that&apos;s
          fine — build it as long as it needs to be.
        </p>
        <p>
          Practically, this means you can only meld this round once your whole hand happens to
          split evenly into exactly 3 runs. Until then, keep drawing and discarding as normal —
          it&apos;s meant to be the hardest round to complete, and usually only one player manages
          it before the game ends.
        </p>
        <Note>
          This rule belongs to the 3 Runs contract specifically, not just &quot;whichever round
          comes last.&quot; If you&apos;re playing Custom and didn&apos;t select round 7, your
          game&apos;s last round follows the normal rule above instead — melding it doesn&apos;t
          require your whole hand.
        </Note>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--heading)]">Scoring</h2>
        <p className="text-sm text-[var(--muted)]">
          When a round ends, every player who did not go out scores penalty points for the cards
          left in their hand. Lowest total score after the game&apos;s last round wins.
        </p>
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--panel)] text-[var(--faint)]">
              <tr>
                <th className="px-3 py-2 font-medium">Card</th>
                <th className="px-3 py-2 font-medium">Penalty points</th>
              </tr>
            </thead>
            <tbody>
              {PENALTY_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-[var(--heading)]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">Organizing your hand</h2>
        <p>
          Your hand order is just for your own convenience — it has no effect on the game. Use{" "}
          <strong className="text-[var(--heading)]">Sort by suit</strong> or{" "}
          <strong className="text-[var(--heading)]">Sort by rank</strong> to group cards automatically, or
          press and drag any card to a new spot to arrange your hand exactly how you like.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">Settings</h2>
        <p>
          Settings lets you pick a color theme for the app and table, set a default AI difficulty
          for new AI opponents you add on the New Game screen, turn sound effects on or off, choose
          whether Table melds groups each player&apos;s books before their runs, and turn the
          possible-lay-off badges on or off. None of that changes any of the rules above —
          it&apos;s all just look-and-feel and optional assistance.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--muted)]">
        <h2 className="text-base font-semibold text-[var(--heading)]">
          In-person rules not implemented
        </h2>
        <p>
          Two house rules from in-person play didn&apos;t make it into this app, both for the same
          reason: they need a player watching their own private hand to react out of turn, which
          doesn&apos;t work on one shared pass-and-play screen with AI opponents auto-playing their
          turns.
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-[var(--heading)]">Buy the discard</strong> — any player other
            than the one who just discarded, or whoever&apos;s up next, could &quot;buy&quot; the
            top of the discard pile out of turn: taking it, plus one penalty card from the draw
            pile, without it becoming their turn. Nobody&apos;s watching for that opportunity on a
            single shared screen, so it&apos;s off.
          </li>
          <li>
            <strong className="text-[var(--heading)]">Player!</strong> — a player who spots a
            discard that fits someone else&apos;s already-laid meld could call it, move that card
            onto the meld themselves, and discard one of their own cards as a reward. Same problem,
            so this one was never built at all.
          </li>
        </ul>
      </section>

      <Link href="/" className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
