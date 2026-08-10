import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Books & Runs",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-bold text-amber-100">Terms of Service</h1>
        <p className="mt-1 text-sm text-emerald-100/50">Last updated August 10, 2026</p>
      </div>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-emerald-100/80">
        <section>
          <p>
            By using Books &amp; Runs (&quot;the app&quot;), you agree to these terms. If you
            don&apos;t agree, please don&apos;t use the app.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">The app</h2>
          <p>
            Books &amp; Runs is a card game for local pass-and-play and single-player games
            against AI opponents. It works fully offline with no account. Creating an account is
            optional and only unlocks cross-device stats — see our{" "}
            <Link href="/privacy" className="underline hover:text-amber-100">
              Privacy Policy
            </Link>{" "}
            for what that involves.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Accounts</h2>
          <p>
            If you create an account, you&apos;re responsible for keeping your credentials secure
            and for anything that happens under your account. Provide accurate information when
            signing up.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Acceptable use</h2>
          <p>
            Don&apos;t use the app to interfere with its normal operation, attempt to access other
            users&apos; data, or use it for anything unlawful.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Intellectual property</h2>
          <p>
            The app&apos;s design, code, and content belong to its developer. The underlying card
            game rules are a common house-rules variant and aren&apos;t owned by anyone.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">
            Disclaimer and limitation of liability
          </h2>
          <p>
            The app is provided &quot;as is,&quot; without warranties of any kind. To the fullest
            extent permitted by law, the developer isn&apos;t liable for any damages arising from
            your use of the app.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Termination</h2>
          <p>
            You can stop using the app or delete your account at any time (see the Privacy Policy
            for how). We may suspend or terminate accounts that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Changes to these terms</h2>
          <p>If these terms change, we&apos;ll update the date at the top of this page.</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-amber-100">Contact</h2>
          <p>
            Questions about these terms? Contact{" "}
            <span className="text-amber-100">nick.l.dimartino@icloud.com</span>.
          </p>
        </section>
      </div>

      <Link href="/" className="text-sm text-emerald-100/60 hover:text-emerald-100">
        Back to Home
      </Link>
    </main>
  );
}
