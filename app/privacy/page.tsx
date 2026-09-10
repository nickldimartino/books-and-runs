import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Books & Runs",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <Link
        href="/"
        className="self-start rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
      >
        ← Home
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">Privacy Policy</h1>
        <p className="mt-1 text-sm text-[var(--faint)]">Last updated September 10, 2026</p>
      </div>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Overview</h2>
          <p>
            Books &amp; Runs is a card game you can play entirely offline, on one device, with no
            account required. This policy explains what happens if you choose to create an
            account, and confirms what we never collect.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Local play needs no account</h2>
          <p>
            If you never sign in, the app collects nothing. Your in-progress game and any
            house-rule settings you choose are stored only in your browser or device&apos;s local
            storage, are never transmitted anywhere, and are never seen by us.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">If you create an account</h2>
          <p className="mb-2">
            Signing in is optional and unlocks Stats, Achievements, your account level, the
            Leaderboard, Friends, and turn-based multiplayer games. If you sign in with email, we
            store:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your email address, via our authentication provider (Supabase Auth).</li>
            <li>
              Game stats tied to your account: games played and won, best, worst, and average
              score, and wins broken down by AI difficulty faced.
            </li>
            <li>
              A history of your completed games: the opponents you faced (AI or other players),
              per-round scores, the winner, and when the game was played.
            </li>
            <li>
              Achievement progress: counts of specific in-game actions — melds made, cards laid
              off, rounds won a particular way, and similar — used to determine which achievements
              you&apos;ve unlocked. Your account level is calculated from this data and the stats
              above, not stored separately.
            </li>
            <li>
              A <span className="text-[var(--heading)]">display name</span>, if you set one. This
              is optional, is <span className="text-[var(--heading)]">visible to other signed-in
              players</span> on the Leaderboard and to anyone you&apos;re friends with, and does
              not have to be your real name. Until you set one you appear as a generated label
              like &ldquo;Player 4821&rdquo;.
            </li>
            <li>
              A per-account <span className="text-[var(--heading)]">friend code</span> and your
              friend list: which other accounts you&apos;ve added as friends, and any pending
              friend requests you&apos;ve sent or received. Adding a friend makes your display
              name visible to them and theirs to you.
            </li>
            <li>
              Multiplayer game data: for any turn-based game you start or join, the other
              participants, the seating, whose turn it is, hand sizes, scores, and the final
              result. The full game state (including the shuffled deck and each player&apos;s
              hand) is held server-side and only ever revealed to a player as their own view —
              you never see another player&apos;s hand.
            </li>
            <li>
              Your default AI difficulty preference, if you set one on the Settings screen. (Theme,
              card back, colorblind mode, and sound/haptics on-off are also set there, but stay
              local to your device and are never sent to us.)
            </li>
          </ul>
          <p className="mt-2">
            We don&apos;t require your real name, and we don&apos;t collect your location,
            contacts, photos, or any device permissions. There are no ads and no analytics or
            tracking SDKs in this app.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Who processes this data</h2>
          <p>
            Account data is stored in a Postgres database hosted by{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--heading)]"
            >
              Supabase
            </a>
            , protected by row-level security so, other than the display name and stats that are
            deliberately shown on the Leaderboard, only you can read or write your own rows.
            Turn-based multiplayer moves are validated by a Supabase Edge Function that runs the
            same game engine; it is the only thing that can see the full hidden game state.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Data retention and deletion</h2>
          <p>
            We keep your account data for as long as your account exists. To delete your account
            and everything tied to it — stats, game history, achievement progress, display name,
            friends, and multiplayer games — email{" "}
            <span className="text-[var(--heading)]">nick.l.dimartino@icloud.com</span> from the
            address on the account and we&apos;ll remove it within a reasonable time. Deleting your
            account also removes you from other players&apos; friends lists.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Children&apos;s privacy</h2>
          <p>
            This app is not directed at children under 13, and we do not knowingly collect
            personal information from them.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Changes to this policy</h2>
          <p>
            If this policy changes, we&apos;ll update the date at the top of this page.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Contact</h2>
          <p>
            Questions, or want your data deleted? Contact{" "}
            <span className="text-[var(--heading)]">nick.l.dimartino@icloud.com</span>.
          </p>
        </section>
      </div>

      <Link href="/" className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
        Back to Home
      </Link>
    </main>
  );
}
