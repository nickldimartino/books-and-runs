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
        <p className="mt-1 text-sm text-[var(--faint)]">Last updated August 13, 2026</p>
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
            Signing in is optional and unlocks Stats, Achievements, and your account level — win
            and progress history tied to your account instead of just one device. If you sign in
            with email, we store:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your email address, via our authentication provider (Supabase Auth).</li>
            <li>
              Game stats tied to your account: games played and won, best, worst, and average
              score, and wins broken down by AI difficulty faced.
            </li>
            <li>
              A history of your completed games: the AI opponents you faced, per-round scores, the
              winner, and when the game was played.
            </li>
            <li>
              Achievement progress: counts of specific in-game actions — melds made, cards laid
              off, rounds won a particular way, and similar — used to determine which achievements
              you&apos;ve unlocked. Your account level is calculated from this data and the stats
              above, not stored separately.
            </li>
            <li>
              Your default AI difficulty preference, if you set one on the Settings screen. (Theme
              and sound effects on/off are also set there, but stay local to your device and are
              never sent to us.)
            </li>
          </ul>
          <p className="mt-2">
            We don&apos;t collect your name, location, contacts, photos, or any device
            permissions. There are no ads and no analytics or tracking SDKs in this app.
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
            , protected by row-level security so only you can ever read or write your own rows.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">Data retention and deletion</h2>
          <p>
            We keep your account data for as long as your account exists. To delete your account
            and all associated stats, game history, and achievement progress, contact us at the
            address below — we&apos;ll remove it within a reasonable time.
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
