import Link from "next/link";

export const metadata = {
  title: "History of Books & Runs — Books & Runs",
};

export default function HistoryPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>

      <h1 className="text-2xl font-bold text-[var(--heading)]">History of Books &amp; Runs</h1>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            A game with a lot of names
          </h2>
          <p>
            &quot;Books and Runs&quot; belongs to the Contract Rummy family of card games,
            believed to trace back to a game called <em>Zioncheck</em>, devised by Ruth Armson.
            Card game historian David Parlett suggests Contract Rummy emerged in the 1930s as a
            follow-on from the era&apos;s Contract Bridge craze — hence &quot;contract&quot;: each
            round requires melding a specific combination of cards all at once, echoing
            bridge&apos;s bidding contract.
          </p>
          <p className="mt-2">
            The terms <strong className="text-[var(--heading)]">Book</strong> (3+ cards of the
            same rank) and <strong className="text-[var(--heading)]">Run</strong> (4+ cards in
            sequence, same suit) come from a specific branch of that family called Liverpool
            Rummy — despite the name, generally documented as a U.S. game, not actually English in
            origin.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            Where this fits among its cousins
          </h2>
          <p>
            Gin Rummy is the odd one out: two players, no rotating per-round contract, just sets
            and runs built to minimize &quot;deadwood&quot; before knocking. Same melding logic,
            entirely different structure — if Gin Rummy is a sprint, Contract Rummy is a season.
          </p>
          <p className="mt-2">
            The most commonly cited version of classic Contract Rummy runs the same 7 contracts as
            this app — 2 books up through 3 runs — but typically in a different order for rounds
            4–6 (3 books, then 2 books + 1 run, then 1 book + 2 runs). This version reorders those
            three rounds, and adds the rule that round 7 must use your entire hand in one meld with
            no discard.
          </p>
          <p className="mt-2">
            Liverpool Rummy is close enough to Contract Rummy that the two names are often used
            interchangeably; the one commonly-cited difference between them is a scoring bonus for
            cutting the deck to land exactly on a face-up card. This app doesn&apos;t include that
            rule.
          </p>
          <p className="mt-2">
            Further out, 500 Rum (Rummy 500) drops the rotating contract entirely — you can meld
            anything, any round, scoring bonus points per card melded instead. Canasta shares the
            same &quot;build sets, add wilds&quot; DNA but uses its own scoring and much larger
            meld requirements. Both are recognizable relatives, but distant enough that most
            players wouldn&apos;t call them the same game.
          </p>
          <p className="mt-2">
            Phase 10 is the one most people reach for as a comparison, and the resemblance is real:
            a fixed sequence of required combinations, one per round, that you must complete exactly
            to advance while everyone else races to do the same. It isn&apos;t a Rummy variant at
            all, though — Fundex/Mattel built it around its own proprietary deck of colored number
            cards plus Wild and Skip cards, not a standard 52-card pack, and its ten phases are
            fixed rather than reshuffled into a new order each time like a real deck would allow.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">This version</h2>
          <p>
            The specific rules this app plays by — 7 rounds building from 2 books up through 3
            runs, wild 2s and jokers, and the penalty scoring table — follow a house-rules version
            of the game rather than any single official rulebook. Contract Rummy has never had one governing rule set; nearly every family
            that plays it has its own variant, and this is ours, built into a pass-and-play app
            with AI opponents standing in when you don&apos;t have enough players at the table.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Credits</h2>
          <p>
            The house rules this app is built on didn&apos;t come from a rulebook — they came from
            years of actual games around an actual table. Thank you to{" "}
            <strong className="text-[var(--heading)]">LeAnne DiMartino</strong>,{" "}
            <strong className="text-[var(--heading)]">Jennifer Monkiewicz</strong>,{" "}
            <strong className="text-[var(--heading)]">John Lich</strong>, and{" "}
            <strong className="text-[var(--heading)]">Erin Peraino</strong> for settling the
            details of how this family actually plays it, which this app now plays by too.
          </p>
          <p className="mt-2">
            This app and website were built by{" "}
            <strong className="text-[var(--heading)]">Nick DiMartino</strong>.
          </p>
        </section>
      </div>

      <Link
        href="/"
        className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
      >
        Back to Home
      </Link>
    </main>
  );
}
