"use client";

// All of History's translated prose, split out of page.tsx so that file can
// stay a Server Component for its metadata export (same reason
// how-to-play/HowToPlayContent.tsx is split out — see its own comment).

import Link from "next/link";
import { useT } from "../lib/i18n/LocaleProvider";

export function HistoryContent() {
  const { t } = useT();

  return (
    <>
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("history.title")}</h1>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            {t("history.names.title")}
          </h2>
          <p>
            {t("history.names.originPrefix")} <em>Zioncheck</em>
            {t("history.names.originSuffix")}
          </p>
          <p className="mt-2">
            {t("history.names.termsIntro")}{" "}
            <strong className="text-[var(--heading)]">{t("history.names.bookLabel")}</strong>{" "}
            {t("history.names.bookParen")}{" "}
            <strong className="text-[var(--heading)]">{t("history.names.runLabel")}</strong>{" "}
            {t("history.names.runParenAndBody")}
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            {t("history.cousins.title")}
          </h2>
          <p>{t("history.cousins.ginRummy")}</p>
          <p className="mt-2">{t("history.cousins.classicOrder")}</p>
          <p className="mt-2">{t("history.cousins.liverpoolRummy")}</p>
          <p className="mt-2">{t("history.cousins.rum500Canasta")}</p>
          <p className="mt-2">{t("history.cousins.phase10")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            {t("history.thisVersion.title")}
          </h2>
          <p>{t("history.thisVersion.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">
            {t("history.credits.title")}
          </h2>
          <p>
            {t("history.credits.thanksPrefix")}{" "}
            <strong className="text-[var(--heading)]">LeAnne DiMartino</strong>,{" "}
            <strong className="text-[var(--heading)]">Jennifer Monkiewicz</strong>,{" "}
            <strong className="text-[var(--heading)]">John Lich</strong>, and{" "}
            <strong className="text-[var(--heading)]">Erin Peraino</strong>{" "}
            {t("history.credits.thanksSuffix")}
          </p>
          <p className="mt-2">
            {t("history.credits.builtByPrefix")}{" "}
            <strong className="text-[var(--heading)]">Nick DiMartino</strong>.
          </p>
        </section>
      </div>

      <Link
        href="/"
        className="text-center text-sm text-[var(--faint)] hover:text-[var(--text)]"
      >
        {t("common.backToHome")}
      </Link>
    </>
  );
}
