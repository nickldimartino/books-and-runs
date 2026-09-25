"use client";

// All of Terms of Service's translated prose, split out of page.tsx so that
// file can stay a Server Component for its metadata export (same pattern as
// app/how-to-play/HowToPlayContent.tsx — see its own comment).

import Link from "next/link";
import { useT } from "../lib/i18n/LocaleProvider";

export function TermsContent() {
  const { t } = useT();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("terms.title")}</h1>
        <p className="mt-1 text-sm text-[var(--faint)]">{t("terms.lastUpdated")}</p>
      </div>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <p>{t("terms.intro")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.app.title")}</h2>
          <p>
            {t("terms.app.bodyPrefix")}{" "}
            <Link href="/privacy" className="underline hover:text-[var(--heading)]">
              {t("signIn.privacyPolicy")}
            </Link>{" "}
            {t("terms.app.bodySuffix")}
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.accounts.title")}</h2>
          <p>{t("terms.accounts.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.acceptableUse.title")}</h2>
          <p>{t("terms.acceptableUse.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.userContent.title")}</h2>
          <p>{t("terms.userContent.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.ip.title")}</h2>
          <p>{t("terms.ip.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.disclaimer.title")}</h2>
          <p>{t("terms.disclaimer.body")}</p>
          <p className="mt-2">{t("terms.disclaimer.statutory")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.service.title")}</h2>
          <p>{t("terms.service.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.termination.title")}</h2>
          <p>{t("terms.termination.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.law.title")}</h2>
          <p>{t("terms.law.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("terms.changes.title")}</h2>
          <p>{t("terms.changes.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("common.contact")}</h2>
          <p>
            {t("terms.contact.body")}{" "}
            <span className="text-[var(--heading)]">nick.l.dimartino@icloud.com</span>.
          </p>
        </section>
      </div>

      <Link href="/" className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </>
  );
}
