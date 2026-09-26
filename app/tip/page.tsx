"use client";

// "Support the developer" — an optional, one-time tip via Stripe Payment
// Links, never a subscription and never anything that touches gameplay.
// Each tier below is its own Payment Link (Stripe Dashboard → Payment
// Links → +New) rather than one variable-amount link — Stripe Payment
// Links don't support a customer-chooses-the-price option, so a fixed
// price per link is the only way to do this with Payment Links at all.
//
// Attribution works without any backend "create checkout" step: Payment
// Links accept `?client_reference_id=<value>` appended to the URL, and
// Stripe carries it straight through onto the completed checkout session.
// The stripe-webhook Edge Function (supabase/functions/stripe-webhook)
// reads that id back off checkout.session.completed and records the
// payment — see migration 0043 for the ☕ Supporter badge this unlocks.
//
// PAYMENT_LINKS below needs your own Stripe account's real links pasted
// in before this page does anything — until then the buttons are
// disabled with a note explaining why, not silently broken.

import Link from "next/link";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { playerProfileHref } from "../lib/leaderboardStore";
import { useT } from "../lib/i18n/LocaleProvider";

interface TipTier {
  label: string;
  blurb: string;
  /** A real "https://buy.stripe.com/..." Payment Link from your Stripe
   * Dashboard, or "" to leave this tier disabled until you've made one. */
  paymentLinkUrl: string;
}

function buildTipTiers(t: ReturnType<typeof useT>["t"]): TipTier[] {
  return [
    {
      label: t("tip.tier.coffee.label"),
      blurb: t("tip.tier.coffee.blurb"),
      paymentLinkUrl: "https://buy.stripe.com/test_cNi00i5Ul2LB9692VPfEk06",
    },
    {
      label: t("tip.tier.roundOfCards.label"),
      blurb: t("tip.tier.roundOfCards.blurb"),
      paymentLinkUrl: "https://buy.stripe.com/test_28EfZg4Qh3PFaadcwpfEk05",
    },
    {
      label: t("tip.tier.fullTable.label"),
      blurb: t("tip.tier.fullTable.blurb"),
      paymentLinkUrl: "https://buy.stripe.com/test_5kQ28qeqRfynaad9kdfEk04",
    },
  ];
}

export default function TipPage() {
  const { configured, user } = useAuth();
  const { t } = useT();
  const PAYMENT_LINKS = buildTipTiers(t);
  const anyLinksConfigured = PAYMENT_LINKS.some((tier) => tier.paymentLinkUrl);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-12">
      <BackLink href="/profile" smart />

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("settings.supportDeveloper")}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {t("tip.intro.prefix")}{" "}
          <Link href="/history" className="underline hover:text-[var(--heading)]">
            {t("tip.intro.historyLink")}
          </Link>
          {t("tip.intro.suffix")}
        </p>
      </div>

      {!configured || !user ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
          <Link href="/sign-in" className="font-semibold text-[var(--accent)] hover:underline">
            {t("signIn.title")}
          </Link>{" "}
          {t("tip.signInPromptSuffix")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {PAYMENT_LINKS.map((tier) => {
            const enabled = !!tier.paymentLinkUrl;
            const className = `flex items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
              enabled
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 hover:bg-[var(--accent)]/15"
                : "cursor-not-allowed border-[var(--border)] opacity-50"
            }`;
            const content = (
              <>
                <span>
                  <span className="block text-sm font-semibold text-[var(--heading)]">{tier.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">{tier.blurb}</span>
                </span>
                <span className="shrink-0 text-[var(--accent)]">→</span>
              </>
            );
            // A real disabled <button>, not aria-disabled on an <a> with a
            // click-preventDefault escape hatch — aria-disabled doesn't
            // reliably stop keyboard activation or screen reader
            // interaction on an anchor the way a native disabled attribute
            // does on a button.
            return enabled ? (
              <a
                key={tier.label}
                href={`${tier.paymentLinkUrl}?client_reference_id=${encodeURIComponent(user.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {content}
              </a>
            ) : (
              <button key={tier.label} type="button" disabled className={className}>
                {content}
              </button>
            );
          })}
          {!anyLinksConfigured && (
            <p className="text-xs text-[var(--faint)]">{t("tip.notConfigured")}</p>
          )}
        </div>
      )}

      {configured && user && (
        <p className="text-xs text-[var(--faint)]">
          {t("tip.afterTip.prefix")}{" "}
          <Link href={playerProfileHref(user.id)} className="underline hover:text-[var(--heading)]">
            {t("tip.afterTip.profileLink")}
          </Link>{" "}
          {t("tip.afterTip.suffix")}
        </p>
      )}
    </main>
  );
}
